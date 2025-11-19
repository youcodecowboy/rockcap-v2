import { NextRequest, NextResponse } from 'next/server';
import { getCompanyCharges, getChargeDocumentUrl, downloadChargeDocument } from '@/lib/companiesHouse/client';
import { api } from '../../../../../convex/_generated/api';
import { fetchMutation } from 'convex/nextjs';

/**
 * Get charges for a company and optionally download PDFs
 * POST /api/companies-house/get-company-charges
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyNumber, downloadPdfs = false } = body;

    if (!companyNumber) {
      return NextResponse.json(
        { error: 'companyNumber is required' },
        { status: 400 }
      );
    }

    const chargesResponse = await getCompanyCharges(companyNumber);

    // If downloadPdfs is true, download and store PDFs
    const chargesWithPdfs = await Promise.all(
      chargesResponse.items.map(async (charge) => {
        const chargeData: any = {
          ...charge,
          pdfUrl: null,
          pdfDocumentId: null,
        };

        if (downloadPdfs && charge.links?.filing) {
          try {
            // Get the document URL
            const documentUrl = await getChargeDocumentUrl(
              companyNumber,
              charge.charge_id || charge.charge_number.toString()
            );

            if (documentUrl) {
              chargeData.pdfUrl = documentUrl;

              // Download the PDF
              const pdfBuffer = await downloadChargeDocument(documentUrl);
              if (pdfBuffer) {
                // Store PDF in Convex storage
                // Note: We'll need to upload this via Convex mutation
                // For now, we'll return the URL and handle storage in the sync endpoint
              }
            }
          } catch (error) {
            console.error(`Error processing PDF for charge ${charge.charge_number}:`, error);
          }
        }

        return chargeData;
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        total_count: chargesResponse.total_count,
        items: chargesWithPdfs,
      },
    });
  } catch (error: any) {
    console.error('Error getting company charges:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get company charges',
      },
      { status: 500 }
    );
  }
}

