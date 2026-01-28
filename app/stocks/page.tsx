import type { Metadata } from 'next';
import './stocks.css';

export const metadata: Metadata = {
  title: 'Gold vs. Stocks Report - Citadel Gold',
};

export default function StocksEmailTemplate() {
  return (
    <div className="stocks-page">
      <div className="email-wrapper">
        <header className="stocks-header">
          <div className="logo-container">
            <img src="/citadel-gold-logo.png" alt="Citadel Gold" className="header-logo" />
          </div>
        </header>

        <div className="stocks-content">
          <p className="greeting">Hi {`{{Prospect Name}}`},</p>

          <p className="body-text">
            I appreciated our conversation today and wanted to follow up with the Gold vs. Stocks report I mentioned.
          </p>

          <p className="body-text">
            The key focus of this piece isn&apos;t short-term market moves — it&apos;s long-term purchasing power. Over the past two decades, gold has risen more than 1,000%, while major stock indexes have delivered significantly less once inflation, fees, and volatility are taken into account.
          </p>

          <div className="image-block">
            <img
              src="/email-template-images/gold-vs-stocks-image.png"
              alt="Gold vs. Stocks - A Look at Long-Term Purchasing Power"
              className="stocks-image"
            />
          </div>

          <p className="body-text">
            The report also walks through why stocks require many things to go right — earnings, rates, politics, confidence — while gold tends to strengthen during the very conditions that hurt paper assets.
          </p>

          <p className="body-text">
            This is why central banks and long-term investors often view gold not as speculation, but as a form of financial insurance.
          </p>

          <p className="body-text">
            Take a look when it&apos;s convenient. I&apos;m happy to answer any questions or discuss how this fits into your broader strategy.
          </p>

          <a href="#" className="cta-button">View the Gold vs. Stocks Report</a>

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
