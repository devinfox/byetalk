import type { Metadata } from 'next';
import './homepage.css';

export const metadata: Metadata = {
  title: 'ByeTalk - Run Your Entire Business in One Intelligent Workspace',
};

export default function Homepage() {
  return (
    <div className="homepage">
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-content">
          <a href="/" className="navbar-logo">
            <img src="/byetalk-logo.png" alt="ByeTalk" />
          </a>
          <div className="navbar-links">
            <a href="#about" className="nav-link">About Us</a>
            <a href="#tools" className="nav-link">Our Tools</a>
            <a href="/signup" className="nav-link">Free Trial</a>
            <a href="/login" className="nav-link-login">Login</a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            Run Your Entire Business
            <br />
            in One <span className="highlight">Intelligent</span> Workspace
          </h1>
          <p className="hero-subtitle">
            ByeTalk brings your leads, calls, emails, tasks, and team
            communication together with AI working behind the scenes.
          </p>
          <div className="hero-ctas">
            <a href="/signup" className="btn-primary">Start Free Trial</a>
            <a href="#demo" className="btn-secondary">Watch 2-Minute Demo</a>
          </div>
        </div>
        <div className="hero-images">
          <img
            src="/homepage-image/byetalk-dashboard-1.png"
            alt="ByeTalk Dashboard"
            className="dashboard-img dashboard-img-1"
          />
          <img
            src="/homepage-image/byetalk-dashboard-2.png"
            alt="ByeTalk Call Summary"
            className="dashboard-img dashboard-img-2"
          />
          <div className="floating-badge badge-followup">
            <span className="badge-dot"></span>
            Follow-up needed
          </div>
          <div className="floating-badge badge-stalled">
            <span className="badge-dot orange"></span>
            Deal stalled 5 days
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="social-proof">
        <div className="stars">★★★★★</div>
        <p>Rated by teams who hate juggling 7 different tools.</p>
      </section>

      {/* Features Grid */}
      <section className="features">
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon blue">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <h3>Leads & Contacts</h3>
            <p>Capture and organize every opportunity</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon purple">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="9" y1="21" x2="9" y2="9"></line>
              </svg>
            </div>
            <h3>Deals & Pipeline</h3>
            <p>Visual pipeline & smart deal tracking</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon green">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </div>
            <h3>Email & Automation</h3>
            <p>Send campaigns & automate follow-ups</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon orange">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
            </div>
            <h3>Calls & Meetings</h3>
            <p>Built-in calling & scheduling</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon teal">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </div>
            <h3>Tasks & Calendar</h3>
            <p>AI-generated follow-ups</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon pink">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
            </div>
            <h3>Presentations</h3>
            <p>Create client-ready decks from your deals</p>
          </div>
        </div>
      </section>

      {/* Replace Your Stack Section */}
      <section className="replace-stack">
        <div className="replace-stack-content">
          <div className="stack-text">
            <h2>Replace Your Stack With One <span className="highlight">Intelligent</span> System</h2>
            <p className="stack-subtitle">Instead of juggling:</p>
            <div className="old-tools">
              <span className="old-tool">CRM</span>
              <span className="old-tool">Dialer</span>
              <span className="old-tool">Email tool</span>
              <span className="old-tool">Task manager</span>
              <span className="old-tool">Notes app</span>
              <span className="old-tool">Reporting tool</span>
              <span className="old-tool">Presentation software</span>
            </div>
            <p className="stack-result">
              <strong>You get:</strong> One connected workspace where conversations, tasks, deals, and even client presentations live together.
            </p>
          </div>
          <div className="stack-visual">
            <div className="tools-collapse">
              <div className="tool-icon">📊</div>
              <div className="tool-icon">📞</div>
              <div className="tool-icon">📧</div>
              <div className="tool-icon">✅</div>
              <div className="tool-icon">📝</div>
              <div className="tool-icon">📈</div>
              <div className="tool-icon">🎯</div>
            </div>
            <div className="arrow-down">→</div>
            <div className="byetalk-unified">
              <span className="byetalk-logo-text">ByeTalk</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works">
        <div className="section-header">
          <h2>See Everything That&apos;s Happening in Your Business — In One View</h2>
          <p>ByeTalk connects conversations, deals, and tasks so you always know what needs attention.</p>
        </div>

        <div className="how-it-works-content">
          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <div className="step-content">
                <h3>Capture</h3>
                <p>Import leads from forms, calls & emails.</p>
              </div>
            </div>

            <div className="step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h3>Engage & Prepare</h3>
                <p>Call, email, meet — and build presentations using real deal data.</p>
              </div>
            </div>

            <div className="step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h3>Close & Grow</h3>
                <p>Track deals & boost revenue.</p>
              </div>
            </div>
          </div>

          <div className="dashboard-showcase">
            <img
              src="/homepage-image/byetalk-dashboard-1.png"
              alt="ByeTalk Dashboard with AI features"
              className="showcase-img"
            />
            <div className="callout callout-1">
              <p>AI created 3 follow-up tasks from this call</p>
            </div>
            <div className="callout callout-2">
              <p>Deal hasn&apos;t moved in 5 days – <span className="nudge">Nudge sent</span></p>
            </div>
            <div className="callout callout-3">
              <p>Email sequence auto-triggered.</p>
            </div>
            <div className="call-summary">
              <h4>Call Summary</h4>
              <p className="summary-meta">AI transcript on call Contact ready</p>
              <div className="action-items">
                <p className="action-label">Action Items</p>
                <label><input type="checkbox" readOnly /> Send proposal by Friday</label>
                <label><input type="checkbox" readOnly /> Schedule follow up meeting</label>
                <label><input type="checkbox" readOnly /> Prepare contract for review</label>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI Section */}
      <section className="ai-section">
        <div className="ai-content">
          <div className="ai-text">
            <h2>AI That Helps You <span className="highlight">Win</span>, Not Just Track</h2>
            <p className="ai-subtitle">ByeTalk&apos;s AI works behind the scenes to keep deals moving forward.</p>
            <ul className="ai-features">
              <li>
                <span className="ai-bullet">✦</span>
                <div>
                  <strong>Auto-summarizes call history</strong> before meetings so you&apos;re always prepared
                </div>
              </li>
              <li>
                <span className="ai-bullet">✦</span>
                <div>
                  <strong>Surfaces deal notes instantly</strong> — no more digging through CRM records
                </div>
              </li>
              <li>
                <span className="ai-bullet">✦</span>
                <div>
                  <strong>Generates follow-up tasks</strong> automatically after every call
                </div>
              </li>
              <li>
                <span className="ai-bullet">✦</span>
                <div>
                  <strong>Helps create presentations</strong> for client pitches using real deal data
                </div>
              </li>
            </ul>
          </div>
          <div className="ai-visual">
            <div className="ai-card">
              <div className="ai-card-header">
                <span className="ai-icon">🧠</span>
                <span>AI Assistant</span>
              </div>
              <div className="ai-card-body">
                <p className="ai-message">Before your 2pm call with Sarah:</p>
                <ul className="ai-insights">
                  <li>Last spoke 12 days ago about IRA rollover</li>
                  <li>Interested in $50K allocation</li>
                  <li>Waiting on spouse approval</li>
                  <li>Prefers email follow-ups</li>
                </ul>
                <div className="ai-action">
                  <button className="ai-btn">View Full Summary</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* From First Call to Final Presentation */}
      <section className="full-journey">
        <div className="journey-content">
          <div className="journey-text">
            <h2>From First Call to Final Presentation — All in One Place</h2>
            <p>Track the deal, manage communication, and create polished client presentations — without switching tools.</p>
            <p className="journey-tagline">ByeTalk helps you <strong>close</strong>, not just manage.</p>
          </div>
          <div className="journey-visual">
            <div className="journey-split">
              <div className="journey-left">
                <div className="mini-label">Pipeline View</div>
                <div className="mini-pipeline">
                  <div className="pipeline-stage">
                    <span className="stage-name">New</span>
                    <div className="stage-cards">
                      <div className="mini-card"></div>
                      <div className="mini-card"></div>
                    </div>
                  </div>
                  <div className="pipeline-stage">
                    <span className="stage-name">Contacted</span>
                    <div className="stage-cards">
                      <div className="mini-card active"></div>
                    </div>
                  </div>
                  <div className="pipeline-stage">
                    <span className="stage-name">Proposal</span>
                    <div className="stage-cards">
                      <div className="mini-card"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="journey-arrow">→</div>
              <div className="journey-right">
                <div className="mini-label">Presentation Builder</div>
                <div className="mini-presentation">
                  <div className="slide-preview">
                    <div className="slide-title"></div>
                    <div className="slide-content"></div>
                    <div className="slide-chart"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="testimonials">
        <h2>Teams Move Faster When Their System Does the Thinking</h2>
        <div className="testimonials-grid">
          <div className="testimonial-card">
            <div className="quote-mark">"</div>
            <p><strong>ByeTalk</strong> replaced three tools and gave us something we never had before.</p>
            <div className="testimonial-author">
              <span className="author-name">— Alex R.,</span>
              <span className="author-title">Sales Director</span>
            </div>
          </div>

          <div className="testimonial-card">
            <div className="quote-mark">"</div>
            <p>The <strong>AI follow-up tasks</strong> alone paid for the software in our first month.</p>
            <div className="testimonial-author">
              <span className="author-name">— Jenna M.,</span>
              <span className="author-title">Agency Founder</span>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="integrations">
        <h2>Works With the Tools <span>You Already Use</span></h2>
        <div className="integrations-logos">
          <div className="integration-logo">
            <span className="google-logo">Google</span>
          </div>
          <div className="integration-logo">
            <span className="microsoft-logo">
              <span className="ms-square red"></span>
              <span className="ms-square green"></span>
              <span className="ms-square blue"></span>
              <span className="ms-square yellow"></span>
              Microsoft
            </span>
          </div>
          <div className="integration-logo">
            <span className="slack-logo">slack</span>
          </div>
          <div className="integration-logo">
            <span className="zapier-logo">zapier</span>
          </div>
          <div className="integration-logo">
            <span className="zoom-logo">zoom</span>
          </div>
          <div className="integration-logo">
            <span className="stripe-logo">stripe</span>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="final-cta">
        <h2>Ready to Run Your Business on Autopilot?</h2>
        <p>Join modern teams using ByeTalk to capture leads, close deals, and automate the busywork.</p>
        <div className="cta-form">
          <input type="email" placeholder="Email Address" className="email-input" />
          <a href="/signup" className="btn-primary">Get Started Free</a>
        </div>
        <span className="no-cc">No credit card required</span>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-links">
            <a href="#">Product</a>
            <a href="#">Pricing</a>
            <a href="#">About</a>
            <a href="#">Blog</a>
            <a href="#">Support</a>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
          </div>
          <p className="copyright">© 2025 ByeTalk. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
