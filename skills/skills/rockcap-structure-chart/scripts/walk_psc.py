#!/usr/bin/env python3
"""
Walk Companies House PSC chain upwards from a borrowing SPV to the UBO(s).

Outputs a JSON tree representing the ownership topology, ready to be passed
into build_chart.py.

Usage:
    python walk_psc.py 13614094                   # default depth 6
    python walk_psc.py 13614094 --max-depth 8
    python walk_psc.py 13614094 --pretty          # human-readable JSON

Requires COMPANIES_HOUSE_API_KEY in ~/.claude/.env.
"""
from __future__ import annotations
import argparse, base64, json, os, re, sys, time, urllib.request, urllib.error
from typing import Any, Dict, List, Optional


def _load_ch_key() -> str:
    env_path = os.path.expanduser('~/.claude/.env')
    with open(env_path) as f:
        m = re.search(r'COMPANIES_HOUSE_API_KEY\s*=\s*(\S+)', f.read())
    if not m:
        raise RuntimeError(f'COMPANIES_HOUSE_API_KEY not found in {env_path}')
    return m.group(1)


CH_KEY = _load_ch_key()
AUTH_HEADER = 'Basic ' + base64.b64encode(f'{CH_KEY}:'.encode()).decode()
BASE = 'https://api.company-information.service.gov.uk'


def _get(url: str, retries: int = 3) -> Optional[Dict]:
    """GET against CH with auth + simple rate-limit / 404 handling."""
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={'Authorization': AUTH_HEADER})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 429:    # rate limit
                time.sleep(5 * (attempt + 1))
                continue
            raise
        except urllib.error.URLError:
            time.sleep(2)
    return None


def _company(co_no: str) -> Optional[Dict]:
    return _get(f'{BASE}/company/{co_no}')


def _pscs(co_no: str) -> List[Dict]:
    data = _get(f'{BASE}/company/{co_no}/persons-with-significant-control')
    if not data:
        return []
    return [p for p in data.get('items', []) if not p.get('ceased')]


def _summary(co_no: str) -> Dict:
    """Return a compact summary of a company for the tree node."""
    c = _company(co_no)
    if not c:
        return {'company_number': co_no, 'name': '(not found on CH)', 'status': 'unknown'}
    addr = c.get('registered_office_address', {})
    return {
        'company_number': co_no,
        'name': c.get('company_name', ''),
        'status': c.get('company_status', ''),
        'incorporated_on': c.get('date_of_creation', ''),
        'registered_office': ', '.join(filter(None, [
            addr.get('premises'), addr.get('address_line_1'), addr.get('address_line_2'),
            addr.get('locality'), addr.get('postal_code')])),
        'previous_names': [p['name'] for p in c.get('previous_company_names', [])],
        'sic_codes': c.get('sic_codes', []),
        'has_charges': c.get('has_charges', False),
    }


def _classify_psc(p: Dict) -> Dict:
    """Pull the bits we care about from a PSC dict."""
    natures = p.get('natures_of_control', [])
    # Extract share % band
    share_band = None
    voting_band = None
    can_appoint = False
    for n in natures:
        if 'ownership-of-shares' in n:
            # e.g. 'ownership-of-shares-75-to-100-percent'
            m = re.search(r'(\d+(?:-to-\d+)?)-percent', n)
            if m:
                share_band = m.group(1).replace('-to-', '-')
        if 'voting-rights' in n:
            m = re.search(r'(\d+(?:-to-\d+)?)-percent', n)
            if m:
                voting_band = m.group(1).replace('-to-', '-')
        if 'right-to-appoint-and-remove-directors' in n:
            can_appoint = True

    kind = p.get('kind', '')
    is_individual = 'individual' in kind
    is_corporate = 'corporate' in kind
    is_legal = 'legal-person' in kind  # foreign / non-CH entity

    out = {
        'kind': kind,
        'name': p.get('name', ''),
        'is_individual': is_individual,
        'is_corporate': is_corporate,
        'is_other_legal_entity': is_legal,
        'share_band': share_band,
        'voting_band': voting_band,
        'can_appoint_directors': can_appoint,
        'natures_of_control': natures,
    }
    if is_corporate or is_legal:
        ident = p.get('identification', {})
        out['parent_company_number'] = ident.get('registration_number', '')
        out['parent_legal_form'] = ident.get('legal_form', '')
        out['parent_country'] = ident.get('country_registered', '')
    return out


def walk(co_no: str, depth: int = 0, max_depth: int = 6,
         seen: Optional[set] = None) -> Dict:
    """Recursively walk PSC chain upwards. Returns tree node."""
    if seen is None:
        seen = set()
    co_no = (co_no or '').strip().upper()
    node = _summary(co_no)
    node['depth'] = depth
    node['pscs'] = []

    if depth >= max_depth:
        node['_truncated'] = 'max-depth reached'
        return node
    if co_no in seen:
        node['_truncated'] = 'cycle detected'
        return node
    seen.add(co_no)

    raw_pscs = _pscs(co_no)
    for raw in raw_pscs:
        psc = _classify_psc(raw)
        # If PSC is corporate AND has a UK CH number, recurse
        if psc.get('is_corporate') and psc.get('parent_company_number'):
            parent_no = psc['parent_company_number']
            # Only recurse if parent looks like a CH number
            if re.match(r'^[A-Z0-9]{6,8}$', parent_no):
                psc['parent'] = walk(parent_no, depth + 1, max_depth, seen.copy())
        node['pscs'].append(psc)

    return node


def main():
    ap = argparse.ArgumentParser(description='Walk CH PSC chain upwards.')
    ap.add_argument('company_number', help='Root SPV company number (e.g. 13614094)')
    ap.add_argument('--max-depth', type=int, default=6)
    ap.add_argument('--pretty', action='store_true', help='Pretty-print JSON')
    ap.add_argument('--out', help='Write JSON to file as well as stdout')
    args = ap.parse_args()

    tree = walk(args.company_number, max_depth=args.max_depth)
    js = json.dumps(tree, indent=2 if args.pretty else None, ensure_ascii=False)
    sys.stdout.write(js + '\n')
    if args.out:
        with open(args.out, 'w', encoding='utf-8') as f:
            f.write(js)


if __name__ == '__main__':
    main()
