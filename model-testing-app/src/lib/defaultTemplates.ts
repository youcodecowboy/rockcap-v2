import { EmailTemplate } from '@/types';

export const defaultTemplates: EmailTemplate[] = [
  {
    id: 'template-1',
    name: 'Cold Outreach - Real Estate Lending',
    category: 'first-contact',
    subject: 'Tailored Financing Solutions for {{companyName}}',
    body: `Hi {{firstName}},

I hope this email finds you well. I came across {{companyName}} and noticed your focus on {{industry}} development. I wanted to reach out because we specialize in providing flexible financing solutions for real estate developers and investors like yourself.

{{keyPoint}}

Based on what I've learned about your business, I believe we could help you with:
- Competitive interest rates and flexible terms
- Quick approval processes for qualified projects
- Expertise in {{industry}} financing
- Personalized service tailored to your needs

{{valueProposition}}

I'd love to schedule a brief call to discuss how we might support your upcoming projects. Would you be available for a 15-minute conversation this week?

{{callToAction}}

Best regards,
[Your Name]
[Your Title]
[Company Name]`,
    description: 'Initial outreach email for real estate developers and investors',
    isActive: true,
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
  },
  {
    id: 'template-2',
    name: 'Follow-up After Proposal',
    category: 'follow-up',
    subject: 'Following up on financing proposal for {{companyName}}',
    body: `Hi {{firstName}},

I wanted to follow up on the financing proposal we sent for {{companyName}} last week. I know you're likely reviewing multiple options, and I wanted to make sure we answered any questions you might have.

{{keyPoint}}

I understand that {{painPoint}} is a priority for you, and our solution specifically addresses this by {{valueProposition}}.

If you'd like to discuss any aspects of the proposal in more detail, or if you have questions about how we can tailor our terms to better fit your needs, I'm here to help.

{{callToAction}}

Looking forward to hearing from you.

Best regards,
[Your Name]`,
    description: 'Follow-up email after sending a financing proposal',
    isActive: true,
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
  },
  {
    id: 'template-3',
    name: 'Check-in - Existing Conversation',
    category: 'check-in',
    subject: 'Checking in on {{companyName}} financing needs',
    body: `Hi {{firstName}},

I wanted to check in and see how things are progressing with {{companyName}}. I know we discussed {{opportunity}} during our last conversation, and I wanted to make sure we're still aligned on how we can help.

{{keyPoint}}

As you continue to evaluate your financing options, I wanted to highlight that we've recently helped similar companies in your industry with {{valueProposition}}.

If your timeline has changed or if you have any new questions, please don't hesitate to reach out. I'm here to help whenever you're ready to move forward.

{{callToAction}}

Best regards,
[Your Name]`,
    description: 'Check-in email for ongoing conversations',
    isActive: true,
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
  },
  {
    id: 'template-4',
    name: 'Introduction After Referral',
    category: 'first-contact',
    subject: '{{referrerName}} suggested I reach out to {{companyName}}',
    body: `Hi {{firstName}},

{{referrerName}} suggested I reach out to you regarding financing solutions for {{companyName}}. They mentioned that you're working on {{opportunity}}, and thought we might be a good fit.

{{keyPoint}}

We've helped {{referrerName}} and other real estate professionals with {{valueProposition}}, and I believe we could provide similar value for your business.

I'd love to schedule a brief call to learn more about your current projects and see how we might be able to help. Would you be available for a 15-minute conversation?

{{callToAction}}

Best regards,
[Your Name]`,
    description: 'Introduction email after receiving a referral',
    isActive: true,
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
  },
];

