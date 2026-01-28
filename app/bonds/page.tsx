import type { Metadata } from 'next';
import './bonds.css';

export const metadata: Metadata = {
  title: 'Bond Market Update - Citadel Gold',
};

export default function BondsEmailTemplate() {
  return (
    <div className="bonds-page">
      <div className="email-wrapper">
        <header className="bonds-header">
          <div className="logo-container">
            <img src="/citadel-gold-logo.png" alt="Citadel Gold" className="header-logo" />
          </div>
        </header>

        <div className="bonds-content">
          <p className="greeting">Hi {`{{Prospect Name}}`},</p>

          <p className="body-text">
            Great speaking with you earlier today. I appreciated the opportunity to talk about how gold can play a role in protecting portfolios, especially with how much uncertainty we&apos;re seeing in traditional markets right now.
          </p>

          <p className="body-text">
            As promised, I&apos;ve attached a short Bond Market Update that walks through what&apos;s been happening beneath the surface. Over the past several months, rising yields, inflation pressure, and increased government debt issuance have all created headwinds for bond prices — particularly for longer-term bonds.
          </p>

          <div className="image-insight-block">
            <div className="gold-image-container">
              <img
                src="/email-template-images/gold-bars.png"
                alt="Gold bars stored in a secure vault"
                className="gold-image"
              />
            </div>

            <div className="key-insight">
              <div className="insight-icon"></div>
              <p className="insight-text">
                <span className="insight-label">KEY INSIGHT</span>  One comparison worth noting is the performance of a $10,000 investment over the past decade: gold appreciated to roughly $58,500, while a similar investment in U.S. bonds reached only $12,000 over the same period.
              </p>
            </div>
          </div>

          <p className="body-text">
            It helps illustrate why many investors are re-thinking how much &quot;safety&quot; bonds are really providing right now.
          </p>

          <p className="body-text">
            At <strong>Citadel Gold</strong>, our goal isn&apos;t to replace everything you own — it&apos;s to help investors understand where price risk, confidence risk, and purchasing-power risk may be hiding, and how hard assets can play a role when paper assets are under pressure.
          </p>

          <div className="chart-section">
            <div className="chart-text">
              <p className="body-text">
                Take a look when you have a moment. If any questions come up or you want to talk through what this means for your situation specifically, I&apos;m always happy to help.
              </p>

              <a href="#" className="cta-button">View the Bond Market Update</a>
            </div>

            <div className="chart-image-container">
              <img
                src="/email-template-images/gold-vs-bonds.png"
                alt="Chart comparing Gold vs U.S. Bonds performance over the last decade"
                className="chart-image"
              />
            </div>
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
