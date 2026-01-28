import type { Metadata } from 'next';
import './annuities.css';

export const metadata: Metadata = {
  title: 'Annuities Overview - Citadel Gold',
};

export default function AnnuitiesEmailTemplate() {
  return (
    <div className="annuities-page">
      <div className="email-wrapper">
        <header className="annuities-header">
          <div className="logo-container">
            <img src="/citadel-gold-logo.png" alt="Citadel Gold" className="header-logo" />
          </div>
        </header>

        <div className="annuities-content">
          <p className="greeting">Hi {`{{Prospect Name}}`},</p>

          <p className="body-text">
            It was great speaking with you today. As promised, I&apos;ve attached an Annuities Overview that walks through how these products are typically structured.
          </p>

          <p className="body-text">
            Annuities are often sold as safe, guaranteed solutions, which can be appealing — especially around retirement. What the attached piece explains is how that safety often comes with trade-offs: long lock-up periods, surrender charges, caps or limits on gains, and reduced flexibility if circumstances change.
          </p>

          <div className="image-block">
            <img
              src="/email-template-images/annuities-vs-gold-silver.jpg"
              alt="Annuities vs. Gold & Silver - A Transparent Comparison"
              className="annuities-image"
            />
          </div>

          <p className="body-text">
            The comparison with physical gold and silver highlights a different approach — direct ownership, no contracts, no surrender schedules, and no dependence on an insurer&apos;s balance sheet.
          </p>

          <p className="body-text">
            At Citadel Gold, we believe safety should come from transparency and control, not fine print. This information is meant to help investors ask better questions and understand what they truly own.
          </p>

          <p className="body-text">
            If you&apos;d like to talk through any part of this or see how it applies to your situation, I&apos;m always happy to help.
          </p>

          <div className="cta-section">
            <span className="kind-regards">Kind regards,</span>
            <a href="#" className="cta-button">View the Annuities Overview</a>
          </div>

          <div className="signature">
            <p className="signature-name">Jonathan Carrington</p>
            <p className="signature-title">Senior Precious Metals Advisor</p>
            <p className="signature-company">CITADEL GOLD</p>
          </div>
        </div>
      </div>
    </div>
  );
}
