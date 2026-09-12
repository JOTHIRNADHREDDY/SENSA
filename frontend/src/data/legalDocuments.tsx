import React from 'react';

interface LegalSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

export interface LegalDocument {
  id: string;
  title: string;
  version: string;
  effectiveDate: string;
  sections: LegalSection[];
}

export const legalDocuments: Record<string, LegalDocument> = {
  terms: {
    id: 'terms',
    title: 'SENSA Terms of Service',
    version: '1.0',
    effectiveDate: 'August 15, 2026',
    sections: [
      { id: '1', title: '1. Acceptance of Terms', content: 'By accessing or using SENSA, you agree to these terms. Global SENSA Terms, Global Privacy Policy, and applicable Regional/Jurisdiction Addenda govern your use.' },
      { id: '2', title: '2. Eligibility and Authority', content: 'You must be authorized to bind your organization to these terms. SENSA is intended for business and professional use and is not directed to children.' },
      { id: '3', title: '3. Software and Hardware Usage', content: 'SENSA provides AI-assisted video analysis and alerting. The software is licensed, not sold.' },
      { id: '4', title: '4. AI Detection and Service Accuracy', content: 'SENSA is an alerting and monitoring platform. Alerts may be delayed, missed, incorrectly generated, or unavailable due to camera failures, network failures, power loss, configuration errors, model limitations, third-party services, or other circumstances. SENSA should not be relied upon as the sole safety, emergency-response, life-safety, or physical-security mechanism.' },
      { id: '5', title: '5. Hardware Deployment, Ownership and Returns', content: 'If hardware is provided, it remains SENSA property until terms are met or returned upon cancellation.' },
      { id: '6', title: '6. Subscription and Payment Terms', content: 'Fees are billed as per your selected plan. Late payments may result in suspension.' },
      { id: '7', title: '7. Free Trials', content: 'Trials are provided "as-is" without warranty or SLA guarantees.' },
      { id: '8', title: '8. Storage Modes', content: 
        <div className="space-y-2">
          <p><strong>Local:</strong> Video processing and storage occur in the customer\'s configured local environment. The customer is responsible for local infrastructure, physical security, network security, backups, and retention settings.</p>
          <p><strong>Hybrid:</strong> Certain processing occurs locally while configured metadata, snapshots, alerts, health information, or other service data may synchronize with SENSA infrastructure according to the selected configuration.</p>
          <p><strong>Cloud:</strong> Configured service data may be stored and processed in SENSA-managed cloud infrastructure and may be subject to applicable data-location and international-transfer provisions.</p>
        </div>
      },
      { id: '9', title: '9. Customer Responsibilities', content: 'Customers are responsible for ensuring that camera deployment, monitoring, recording, employee monitoring, biometric processing, and alert practices comply with applicable laws, notices, consent requirements, workplace rules, and local restrictions.' },
      { id: '10', title: '10. Acceptable Use', content: 'You may not use the service for illegal surveillance, harassment, or in violation of privacy laws.' },
      { id: '11', title: '11. CCTV and Video Monitoring Responsibilities', content: 'You are solely responsible for providing adequate notice to individuals monitored by your CCTV networks connected to SENSA.' },
      { id: '12', title: '12. AI and Automated Decision Limitations', content: 'Certain AI features, including facial recognition, biometric identification, person re-identification, workplace monitoring, or automated profiling may be restricted or subject to additional legal requirements in some jurisdictions. Availability and use may therefore depend on location, customer configuration, and applicable law.' },
      { id: '13', title: '13. Third-Party Services', content: 'Integrations (e.g., WhatsApp, Meta) are governed by their respective terms and privacy policies.' },
      { id: '14', title: '14. Intellectual Property', content: 'SENSA retains all rights to its software, AI models, and platform.' },
      { id: '15', title: '15. Confidentiality', content: 'Both parties agree to protect proprietary information shared during the service.' },
      { id: '16', title: '16. Security', content: 'SENSA implements technical and organizational security measures appropriate to the service and deployment configuration. We do not guarantee 100% security.' },
      { id: '17', title: '17. Availability and Service Levels', content: 'We do not promise uninterrupted service. Uptime is subject to standard SLA terms where applicable.' },
      { id: '18', title: '18. Limitation of Liability', content: 'SENSA is not liable for indirect, incidental, or consequential damages. Maximum liability is limited to fees paid in the preceding 12 months.' },
      { id: '19', title: '19. Indemnification', content: 'You agree to indemnify SENSA against claims arising from your unlawful use of the service or failure to provide CCTV notices.' },
      { id: '20', title: '20. Suspension', content: 'We may suspend access for non-payment or severe violations of acceptable use.' },
      { id: '21', title: '21. Termination', content: 'Either party may terminate for convenience with appropriate notice, or immediately for material breach.' },
      { id: '22', title: '22. Data After Termination', content: 'We will delete or anonymize customer data upon termination as outlined in our Privacy Policy.' },
      { id: '23', title: '23. Changes to the Service', content: 'We may update, add, or deprecate features with reasonable notice.' },
      { id: '24', title: '24. Changes to Terms', content: 'Terms may be updated periodically. Continued use constitutes acceptance.' },
      { id: '25', title: '25. Governing Law', content: 'These terms are governed by the laws applicable to your contracting SENSA entity.' },
      { id: '26', title: '26. Dispute Resolution', content: 'Disputes will be resolved through binding arbitration or appropriate commercial courts.' },
      { id: '27', title: '27. International Customers', content: 'You must comply with export control and local compliance laws.' },
      { id: '28', title: '28. Regional Addenda', content: 'Specific regional terms may override these standard terms as documented in our Regional Addenda.' },
      { id: '29', title: '29. General Provisions', content: 'Severability, waiver, and assignment clauses.' },
      { id: '30', title: '30. Contact Information', content: 'Legal notices may be sent to legal@sensa.com.' },
    ]
  },
  privacy: {
    id: 'privacy',
    title: 'SENSA Privacy Policy',
    version: '1.0',
    effectiveDate: 'August 15, 2026',
    sections: [
      { id: '1', title: '1. Who We Are', content: 'SENSA provides AI video analytics. This policy explains how we process personal data globally.' },
      { id: '2', title: '2. Scope', content: 'This policy applies to our website, edge appliances, cloud services, and mobile applications.' },
      { id: '3', title: '3. Information We Collect', content: 'We collect account details, telemetry, metadata, and where configured, video snapshots.' },
      { id: '4', title: '4. Account Information', content: 'Name, email, billing details, and enterprise configurations.' },
      { id: '5', title: '5. Camera and Video Data', content: 'Processed depending on your storage mode (Local, Hybrid, or Cloud).' },
      { id: '6', title: '6. Local Video Processing', content: 'In Local mode, video remains within the customer\'s local environment, subject to the customer\'s own network, computer, camera, security, and configuration.' },
      { id: '7', title: '7. Detection Metadata', content: 'We process bounding boxes, timestamps, and classifications to generate alerts.' },
      { id: '8', title: '8. Telemetry and Device Information', content: 'We monitor edge appliance health, uptime, and system performance.' },
      { id: '9', title: '9. Alerts and Communications', content: 'Data used to route SMS, email, and WhatsApp notifications.' },
      { id: '10', title: '10. WhatsApp / Meta Integrations', content: 'Usage of WhatsApp subjects alerting data to Meta\'s privacy policies.' },
      { id: '11', title: '11. Cookies and Similar Technologies', content: 'We use strictly necessary and optional analytics cookies on our web properties.' },
      { id: '12', title: '12. Payment Information', content: 'Processed securely by compliant third-party payment gateways (e.g., Stripe).' },
      { id: '13', title: '13. Support Communications', content: 'Records of tickets, emails, and troubleshooting data.' },
      { id: '14', title: '14. AI Processing', content: 'AI inference is used solely for the purposes defined in your configuration.' },
      { id: '15', title: '15. Facial Recognition / Biometric Processing', content: 'Certain AI features, including facial recognition, biometric identification, or person re-identification may be restricted. Customers must independently verify legal bases before enabling these modules.' },
      { id: '16', title: '16. Workplace Monitoring', content: 'Customers must adhere to local labor laws when deploying SENSA in employee areas.' },
      { id: '17', title: '17. Children\'s Data', content: 'SENSA is intended for business and professional use and is not directed to children. Customers must not use SENSA to knowingly collect children\'s personal data except where legally permitted and appropriately authorized.' },
      { id: '18', title: '18. Data Retention', content: 'Alert metadata is retained per customer configuration. Cloud data is subject to default 30-day limits unless contracted otherwise.' },
      { id: '19', title: '19. Data Deletion', content: 'Customers may request or configure automatic deletion of historical metadata.' },
      { id: '20', title: '20. Data Security', content: 'SENSA implements technical and organizational security measures appropriate to the service and deployment configuration.' },
      { id: '21', title: '21. Encryption in Transit', content: 'All telemetry and cloud-bound data utilizes TLS 1.2+ encryption.' },
      { id: '22', title: '22. Encryption at Rest', content: 'Cloud databases are encrypted at rest using AES-256.' },
      { id: '23', title: '23. Access Controls', content: 'Strict RBAC is enforced for SENSA personnel and customer dashboards.' },
      { id: '24', title: '24. Incident Response', content: 'We maintain an active incident response plan for data breaches.' },
      { id: '25', title: '25. International Data Transfers', content: 'SENSA may process or transfer personal data across borders where necessary to provide the Service. Depending on the jurisdiction, SENSA may rely on appropriate transfer mechanisms and safeguards, which may include adequacy decisions, standard contractual clauses, contractual safeguards, or other legally recognized mechanisms.' },
      { id: '26', title: '26. Data Residency', content: 'Enterprise customers may configure specific data residency regions.' },
      { id: '27', title: '27. Data Processors and Subprocessors', content: 'We maintain a list of vetted third-party subprocessors available upon request.' },
      { id: '28', title: '28. Legal Bases for Processing', content: 'We process data based on contract fulfillment, legitimate interest, and consent.' },
      { id: '29', title: '29. User Rights', content: 'You may access, correct, or delete your personal account data.' },
      { id: '30', title: '30. Data Subject Requests', content: 'For video subjects, the Customer acts as the Data Controller. Requests must be routed to the Customer.' },
      { id: '31', title: '31. India — DPDP Rights', content: 'Rights applicable under the Digital Personal Data Protection Act 2023.' },
      { id: '32', title: '32. EU/EEA — GDPR Rights', content: 'Rights to erasure, portability, and restriction of processing.' },
      { id: '33', title: '33. UK Data Protection Rights', content: 'Rights under the UK GDPR and Data Protection Act 2018.' },
      { id: '34', title: '34. US State Privacy Rights', content: 'Comprehensive disclosures for applicable US states.' },
      { id: '35', title: '35. California Privacy Rights', content: 'CCPA/CPRA specific disclosures and "Do Not Sell" provisions.' },
      { id: '36', title: '36. Canada Privacy Rights', content: 'PIPEDA compliance and rights.' },
      { id: '37', title: '37. Brazil LGPD Rights', content: 'Rights established under Lei Geral de Proteção de Dados.' },
      { id: '38', title: '38. Australia Privacy Rights', content: 'Compliance with the Privacy Act 1988.' },
      { id: '39', title: '39. Other Jurisdictional Rights', content: 'Rights applicable in other operational territories.' },
      { id: '40', title: '40. Government and Law Enforcement Requests', content: 'We review all requests for legal validity and notify customers where permitted.' },
      { id: '41', title: '41. Changes to Privacy Policy', content: 'We will notify users of material changes.' },
      { id: '42', title: '42. Contact / Privacy Contact', content: 'privacy@sensa.com' },
      { id: '43', title: '43. Data Protection Officer', content: 'Where legally required, our DPO can be reached at dpo@sensa.com.' },
      { 
        id: 'regional-links', 
        title: 'Regional Privacy Addenda', 
        content: 
        <div className="mt-4">
          <p className="mb-4 text-slate-400">Where applicable, additional jurisdiction-specific rights and requirements are provided in the relevant Regional Addendum.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sky-400">
            <button className="text-left hover:underline">European Union / EEA</button>
            <button className="text-left hover:underline">United Kingdom</button>
            <button className="text-left hover:underline">India</button>
            <button className="text-left hover:underline">United States</button>
            <button className="text-left hover:underline">California</button>
            <button className="text-left hover:underline">Canada</button>
            <button className="text-left hover:underline">Brazil</button>
            <button className="text-left hover:underline">Australia</button>
            <button className="text-left hover:underline">New Zealand</button>
            <button className="text-left hover:underline">Singapore</button>
            <button className="text-left hover:underline">Japan</button>
            <button className="text-left hover:underline">South Korea</button>
            <button className="text-left hover:underline">China</button>
            <button className="text-left hover:underline">UAE</button>
            <button className="text-left hover:underline">Saudi Arabia</button>
            <button className="text-left hover:underline">South Africa</button>
            <button className="text-left hover:underline">Mexico</button>
            <button className="text-left hover:underline">Indonesia</button>
          </div>
        </div>
      }
    ]
  },
  cctvNotice: {
    id: 'cctvNotice',
    title: 'CCTV & Responsible Use Notice',
    version: '1.0',
    effectiveDate: 'August 15, 2026',
    sections: [
      { id: '1', title: 'Customer Responsibility', content: 'SENSA provides AI-assisted video analysis and alerting. Customers are responsible for ensuring that camera deployment, monitoring, recording, employee monitoring, biometric processing, and alert practices comply with applicable laws, notices, consent requirements, workplace rules, and local restrictions.' }
    ]
  },
  aiNotice: {
    id: 'aiNotice',
    title: 'AI & Automated Decision Notice',
    version: '1.0',
    effectiveDate: 'August 15, 2026',
    sections: [
      { id: '1', title: 'Limitations of AI', content: 'Certain AI features, including facial recognition, biometric identification, person re-identification, workplace monitoring, or automated profiling may be restricted or subject to additional legal requirements in some jurisdictions. Availability and use may therefore depend on location, customer configuration, and applicable law.' }
    ]
  }
};
