import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for Museum Guide',
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="prose prose-neutral max-w-none">
        <h1>Terms of Service</h1>
        <p>Last updated: March 06, 2026</p>

        <p>
          These Terms of Service govern your access to and use of Museum Guide,
          including our website, applications, and related services (the
          &quot;Service&quot;). By using the Service, you agree to these Terms.
          If you do not agree, do not use the Service.
        </p>

        <h2>1. About the Service</h2>
        <p>
          Museum Guide provides tools and AI-generated content designed to help
          users explore, identify, and learn about museum objects, exhibits, and
          related cultural material.
        </p>

        <h2>2. Eligibility and Accounts</h2>
        <p>
          You may need an account to use some features of the Service. When you
          create an account, you agree to provide accurate information and to
          keep your login credentials secure. You are responsible for activity
          that occurs under your account.
        </p>

        <h2>3. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>use the Service for unlawful purposes</li>
          <li>upload content you do not have the right to use</li>
          <li>attempt to interfere with, damage, or disrupt the Service</li>
          <li>reverse engineer, scrape, or abuse the Service at scale</li>
          <li>
            use the Service to generate misleading, harmful, or fraudulent
            content
          </li>
        </ul>

        <h2>4. User Content</h2>
        <p>
          You may upload images, text, or other material through the Service
          (&quot;User Content&quot;). You retain ownership of your User Content.
        </p>
        <p>
          By uploading User Content, you grant Museum Guide a non-exclusive,
          worldwide, limited license to host, store, process, reproduce, and use
          that content solely for the purpose of operating, improving, and
          providing the Service.
        </p>
        <p>
          You are responsible for ensuring that your User Content does not
          violate any law or infringe the rights of any third party.
        </p>

        <h2>5. AI-Generated Content</h2>
        <p>
          The Service may generate descriptions, interpretations, summaries, or
          other outputs using artificial intelligence. These outputs may be
          inaccurate, incomplete, or outdated.
        </p>
        <p>
          AI-generated content is provided for general informational purposes
          only and should not be relied upon as authoritative museum,
          historical, academic, legal, or professional advice.
        </p>

        <h2>6. Intellectual Property</h2>
        <p>
          The Service, including its software, design, branding, and original
          content created by Museum Guide, is owned by or licensed to Museum
          Guide and is protected by applicable intellectual property laws.
        </p>
        <p>
          These Terms do not grant you any right to use our name, logo, or
          branding except as allowed by law or with our written permission.
        </p>

        <h2>7. Third-Party Services</h2>
        <p>
          The Service may rely on or link to third-party services, including
          authentication, hosting, analytics, and AI providers. We are not
          responsible for third-party services or their availability.
        </p>

        <h2>8. Suspension and Termination</h2>
        <p>
          We may suspend or terminate your access to the Service at any time if
          we believe you have violated these Terms, created risk for other
          users, or misused the Service.
        </p>
        <p>You may stop using the Service at any time.</p>

        <h2>9. Changes to the Service</h2>
        <p>
          We may modify, update, suspend, or discontinue any part of the Service
          at any time, with or without notice.
        </p>

        <h2>10. Disclaimer of Warranties</h2>
        <p>
          The Service is provided on an &quot;as is&quot; and &quot;as
          available&quot; basis. To the maximum extent permitted by law, Museum
          Guide disclaims all warranties, express or implied, including
          warranties of merchantability, fitness for a particular purpose, and
          non-infringement.
        </p>

        <h2>11. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, Museum Guide will not be
          liable for any indirect, incidental, special, consequential, or
          punitive damages, or for any loss of data, profits, goodwill, or
          business opportunity arising out of or related to your use of the
          Service.
        </p>
        <p>
          Museum Guide is not responsible for decisions made or actions taken
          based on AI-generated content or other information provided through
          the Service.
        </p>

        <h2>12. Governing Law</h2>
        <p>
          These Terms are governed by the laws of Germany, without regard to
          conflict of law principles.
        </p>

        <h2>13. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. If we do, we will post
          the updated version on this page and update the &quot;Last
          updated&quot; date. By continuing to use the Service after changes
          become effective, you agree to the revised Terms.
        </p>

        <h2>14. Contact</h2>
        <p>
          If you have questions about these Terms, contact us at:
          museumguideio@gmail.com
        </p>
      </div>
    </main>
  );
}
