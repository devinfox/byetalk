'use client';

import { useEffect, useState } from 'react';
import './homepage-2.css';

export default function Homepage2() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, observerOptions);

    document.querySelectorAll('.animate-on-scroll').forEach(el => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="homepage-2">
      {/* Background Effects */}
      <div className="bg-effects">
        <div className="gradient-orb orb-1"></div>
        <div className="gradient-orb orb-2"></div>
        <div className="gradient-orb orb-3"></div>
        <div className="grid-overlay"></div>
      </div>

      {/* Navigation */}
      <nav className={scrolled ? 'scrolled' : ''}>
        <div className="nav-container">
          <a href="#" className="logo">
            <img src="/byetalk-logo-blue.png" alt="ByeTalk" className="logo-img" />
          </a>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#pricing">Pricing</a>
            <a href="#about">About Us</a>
          </div>
          <div className="nav-cta">
            <a href="/login" className="btn btn-ghost">Login</a>
            <a href="/signup" className="btn btn-primary">Start Free Trial</a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-container">
          <div className="hero-content">
            <h1>Run Your Entire Business in One <span className="gradient-text">Intelligent</span> Workspace</h1>
            <p>ByeTalk unifies your leads, calls, emails, tasks, and team communication together with AI working behind the scenes.</p>
            <div className="hero-cta">
              <a href="/signup" className="btn btn-primary btn-large">Start Free Trial</a>
              <a href="#" className="watch-demo">
                <div className="play-icon">▶</div>
                Watch 2-Minute Demo
              </a>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-visual-wrapper">
              <div className="dashboard-preview">
                <div className="dashboard-header">
                  <div className="dashboard-dot red"></div>
                  <div className="dashboard-dot yellow"></div>
                  <div className="dashboard-dot green"></div>
                </div>
                <div className="dashboard-content">
                  <div className="dashboard-sidebar">
                    <div className="sidebar-item active">
                      <div className="sidebar-icon">📊</div>
                      Dashboard
                    </div>
                    <div className="sidebar-item">
                      <div className="sidebar-icon">👥</div>
                      Contacts
                    </div>
                    <div className="sidebar-item">
                      <div className="sidebar-icon">📞</div>
                      Calls
                    </div>
                    <div className="sidebar-item">
                      <div className="sidebar-icon">✉️</div>
                      Email
                    </div>
                    <div className="sidebar-item">
                      <div className="sidebar-icon">📅</div>
                      Calendar
                    </div>
                  </div>
                  <div className="dashboard-main">
                    <div className="dashboard-main-header">
                      <span className="dashboard-main-title">Revenue Overview</span>
                      <span className="revenue-up">↑ 24%</span>
                    </div>
                    <div className="dashboard-chart">
                      <div className="chart-bar" style={{ height: '40%' }}></div>
                      <div className="chart-bar" style={{ height: '60%' }}></div>
                      <div className="chart-bar" style={{ height: '45%' }}></div>
                      <div className="chart-bar" style={{ height: '80%' }}></div>
                      <div className="chart-bar" style={{ height: '65%' }}></div>
                      <div className="chart-bar" style={{ height: '90%' }}></div>
                      <div className="chart-bar" style={{ height: '75%' }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Cards */}
              <div className="floating-card floating-card-1">
                <div className="stat-card">
                  <div className="stat-icon">📈</div>
                  <div className="stat-info">
                    <div className="stat-value">+147%</div>
                    <div className="stat-label">Lead Conversion</div>
                  </div>
                </div>
              </div>
              <div className="floating-card floating-card-2">
                <div className="stat-card">
                  <div className="stat-icon">⚡</div>
                  <div className="stat-info">
                    <div className="stat-value">3.2s</div>
                    <div className="stat-label">Avg Response</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trusted Section */}
      <section className="trusted">
        <div className="trusted-container">
          <div className="trusted-header">
            <span className="stars">★★★★★</span>
            <span className="trusted-text">Rated by teams who stopped juggling <a href="#">7 different tools</a></span>
          </div>
          <div className="trusted-logos">
            <span className="trusted-logo">Google</span>
            <span className="trusted-logo">Microsoft</span>
            <span className="trusted-logo">Slack</span>
            <span className="trusted-logo">Zapier</span>
            <span className="trusted-logo">Zoom</span>
            <span className="trusted-logo">Stripe</span>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="features" id="features">
        <div className="features-container">
          <div className="section-header animate-on-scroll">
            <span className="section-label">✨ Features</span>
            <h2 className="section-title">Everything Your Business Needs</h2>
            <p className="section-subtitle">Replace your scattered tools with one powerful platform that keeps your entire team aligned and efficient.</p>
          </div>
          <div className="features-grid">
            <div className="feature-card animate-on-scroll">
              <div className="feature-icon">👥</div>
              <h3>Leads & Contacts</h3>
              <p>Capture and organize every lead automatically. Never lose a potential customer again.</p>
            </div>
            <div className="feature-card animate-on-scroll">
              <div className="feature-icon">📋</div>
              <h3>Deals & Pipeline</h3>
              <p>Visual pipelines and smart deal tracking that adapts to your workflow instantly.</p>
            </div>
            <div className="feature-card animate-on-scroll">
              <div className="feature-icon">✉️</div>
              <h3>Email & Automation</h3>
              <p>Send sequences and automate outreach while keeping that personal touch intact.</p>
            </div>
            <div className="feature-card animate-on-scroll">
              <div className="feature-icon">📞</div>
              <h3>Calls & Meetings</h3>
              <p>Built-in calling and calendar sync with automatic call recording and transcription.</p>
            </div>
            <div className="feature-card animate-on-scroll">
              <div className="feature-icon">✅</div>
              <h3>Tasks & Calendar</h3>
              <p>Stay on top of every deadline with intelligent task management and team calendars.</p>
            </div>
            <div className="feature-card animate-on-scroll">
              <div className="feature-icon">📊</div>
              <h3>Presentations</h3>
              <p>Create stunning client decks with your data, ready to present in seconds.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Replace Your Stack */}
      <section className="replace-stack">
        <div className="replace-stack-container">
          <div className="stack-content animate-on-scroll">
            <h2>Replace Your Stack With One <span className="gradient-text">Intelligent</span> System</h2>
            <p>Instead of juggling multiple tools, you get one connected workspace where conversations, tasks, docs, and even client presentations live together.</p>
            <div className="stack-pills">
              <span className="stack-pill">CRM</span>
              <span className="stack-pill">Dialer</span>
              <span className="stack-pill">Email Client</span>
              <span className="stack-pill">Task Manager</span>
              <span className="stack-pill">Scheduler</span>
              <span className="stack-pill">Slide Maker</span>
            </div>
            <a href="#how-it-works" className="btn btn-primary btn-large">See How It Works</a>
          </div>
          <div className="stack-visual animate-on-scroll">
            <div className="stack-icons">
              <div className="stack-icon-card">
                <span className="icon">📧</span>
                <span>Email</span>
              </div>
              <div className="stack-icon-card">
                <span className="icon">📞</span>
                <span>Calls</span>
              </div>
              <div className="stack-icon-card">
                <span className="icon">💬</span>
                <span>Chat</span>
              </div>
              <div className="stack-icon-card">
                <span className="icon">📊</span>
                <span>Analytics</span>
              </div>
              <div className="stack-icon-card">
                <span className="icon">✅</span>
                <span>Tasks</span>
              </div>
              <div className="stack-icon-card">
                <span className="icon">📅</span>
                <span>Calendar</span>
              </div>
              <div className="stack-icon-card highlight">
                <img src="/byetalk-logo-blue.png" alt="ByeTalk" className="stack-logo-img" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="how-it-works" id="how-it-works">
        <div className="how-it-works-container">
          <div className="section-header animate-on-scroll">
            <span className="section-label">🚀 How It Works</span>
            <h2 className="section-title">See Everything in Your Business — In One View</h2>
            <p className="section-subtitle">ByeTalk connects conversations, deals, and tasks so you always know what needs attention.</p>
          </div>
          <div className="how-it-works-grid">
            <div className="steps-list">
              <div className="step animate-on-scroll">
                <div className="step-number">1</div>
                <div className="step-content">
                  <h3>Capture</h3>
                  <p>Import leads from any source. Let AI create the initial summary for faster follow-ups.</p>
                </div>
              </div>
              <div className="step animate-on-scroll">
                <div className="step-number">2</div>
                <div className="step-content">
                  <h3>Engage & Prepare</h3>
                  <p>Call, email, or chat with auto-transcriptions using your deal data.</p>
                </div>
              </div>
              <div className="step animate-on-scroll">
                <div className="step-number">3</div>
                <div className="step-content">
                  <h3>Close & Grow</h3>
                  <p>Track deals and build revenue with intelligent recommendations.</p>
                </div>
              </div>
            </div>
            <div className="workflow-visual animate-on-scroll">
              <div className="workflow-screens">
                <div className="workflow-screen">
                  <div className="screen-header">
                    <span className="screen-title">Call Summary</span>
                    <span className="screen-badge">Just ended</span>
                  </div>
                  <div className="screen-content">
                    <div className="screen-row">✓ Discussed Q2 pricing proposal</div>
                    <div className="screen-row">✓ Client interested in premium tier</div>
                    <div className="screen-row">→ Follow up by Friday</div>
                  </div>
                </div>
                <div className="workflow-screen">
                  <div className="screen-header">
                    <span className="screen-title">Call Discovery</span>
                    <span className="screen-badge">AI Suggested</span>
                  </div>
                  <div className="screen-content">
                    <div className="screen-row">Budget: $50K-75K range</div>
                    <div className="screen-row">Timeline: Q2 implementation</div>
                    <div className="screen-row">Decision maker: VP of Sales</div>
                  </div>
                </div>
                <div className="workflow-screen">
                  <div className="screen-header">
                    <span className="screen-title">Next Actions</span>
                  </div>
                  <div className="screen-content">
                    <div className="screen-row">📧 Send revised proposal</div>
                    <div className="screen-row">📅 Schedule demo call</div>
                    <div className="screen-row">📊 Prepare presentation</div>
                  </div>
                </div>
                <div className="workflow-screen">
                  <div className="screen-header">
                    <span className="screen-title">Deal Progress</span>
                  </div>
                  <div className="screen-content">
                    <div className="screen-row">Stage: Negotiation (75%)</div>
                    <div className="screen-row">Value: $67,500</div>
                    <div className="screen-row">Expected close: Feb 15</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI Section */}
      <section className="ai-section">
        <div className="ai-container">
          <div className="ai-content animate-on-scroll">
            <h2>AI That Helps You <span className="highlight">Win</span>, Not Just Track</h2>
            <p>ByeTalk&apos;s AI works behind the scenes to keep deals moving forward. Get intelligent suggestions, automatic summaries, and proactive alerts.</p>
            <div className="ai-features">
              <div className="ai-feature">
                <div className="ai-feature-icon">🔄</div>
                <span>Auto-summarizes call history before meetings</span>
              </div>
              <div className="ai-feature">
                <div className="ai-feature-icon">🎯</div>
                <span>Surfaces deal risks instantly from CRM records</span>
              </div>
              <div className="ai-feature">
                <div className="ai-feature-icon">📋</div>
                <span>Generates follow-up tasks automatically</span>
              </div>
              <div className="ai-feature">
                <div className="ai-feature-icon">📊</div>
                <span>Creates presentations for client pitches</span>
              </div>
            </div>
          </div>
          <div className="ai-visual animate-on-scroll">
            <div className="ai-chat-preview">
              <div className="ai-chat-header">
                <div className="ai-avatar">🤖</div>
                <div>
                  <div className="ai-name">AI Assistant</div>
                  <div className="ai-status">● Online</div>
                </div>
              </div>
              <div className="chat-messages">
                <div className="chat-message user">
                  <p>Refresh my last call with Acme.</p>
                </div>
                <div className="chat-message ai">
                  <p>Last spoke 12 days ago about PMI services. They mentioned an 85% utilization rate on current SEM solution.</p>
                </div>
                <div className="chat-message user">
                  <p>What&apos;s a good talking point?</p>
                </div>
                <div className="chat-message ai">
                  <p>Based on their utilization concerns, I&apos;d recommend discussing how our premium tier could improve efficiency by 40%. Would you like me to prepare a comparison deck?</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="testimonials-section">
        <div className="testimonials-container">
          <div className="section-header animate-on-scroll">
            <span className="section-label">💬 Testimonials</span>
            <h2 className="section-title">Teams Move Faster When Their System Does the Thinking</h2>
          </div>
          <div className="testimonials-grid">
            <div className="testimonial-card animate-on-scroll">
              <p className="testimonial-quote">ByeTalk replaced three tools and got us to closing on our first big deal in two weeks. The AI follow-up suggestions alone saved us 10 hours a week.</p>
              <div className="testimonial-author">
                <div className="author-avatar">SK</div>
                <div>
                  <div className="author-name">Sarah Kim</div>
                  <div className="author-role">Sales Director</div>
                </div>
              </div>
            </div>
            <div className="testimonial-card animate-on-scroll">
              <p className="testimonial-quote">The AI follow-up tasks were paid for in the software by our first month. Our close rate went up 35% because nothing falls through the cracks anymore.</p>
              <div className="testimonial-author">
                <div className="author-avatar">MJ</div>
                <div>
                  <div className="author-name">Marcus Johnson</div>
                  <div className="author-role">Agency Founder</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="integrations-section">
        <div className="integrations-container">
          <div className="section-header animate-on-scroll">
            <span className="section-label">🔗 Integrations</span>
            <h2 className="section-title">Works With the Tools You Already Use</h2>
          </div>
          <div className="integrations-logos animate-on-scroll">
            <div className="integration-logo">
              <span className="google-dot blue">●</span>
              <span className="google-dot red">●</span>
              <span className="google-dot yellow">●</span>
              <span className="google-dot green">●</span>
              Google
            </div>
            <div className="integration-logo">Microsoft</div>
            <div className="integration-logo">Slack</div>
            <div className="integration-logo zapier">Zapier</div>
            <div className="integration-logo zoom">Zoom</div>
            <div className="integration-logo stripe">Stripe</div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta">
        <div className="cta-container animate-on-scroll">
          <h2>Ready to Run Your Business on Autopilot?</h2>
          <p>Join modern teams using ByeTalk to capture leads, close deals, and automate the busywork.</p>
          <div className="cta-form">
            <input type="email" className="cta-input" placeholder="Enter your email" />
            <a href="/signup" className="btn btn-primary btn-large">Get Started Free</a>
          </div>
          <p className="cta-subtext">No credit card required • 14-day free trial</p>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="footer-container">
          <div className="footer-grid">
            <div className="footer-brand">
              <a href="#" className="logo">
                <img src="/byetalk-logo-blue.png" alt="ByeTalk" className="logo-img" />
              </a>
              <p>The intelligent workspace that helps teams close more deals with less effort.</p>
            </div>
            <div className="footer-column">
              <h4>Product</h4>
              <ul>
                <li><a href="#">Features</a></li>
                <li><a href="#">Pricing</a></li>
                <li><a href="#">Integrations</a></li>
                <li><a href="#">Changelog</a></li>
              </ul>
            </div>
            <div className="footer-column">
              <h4>Company</h4>
              <ul>
                <li><a href="#">About</a></li>
                <li><a href="#">Blog</a></li>
                <li><a href="#">Careers</a></li>
                <li><a href="#">Contact</a></li>
              </ul>
            </div>
            <div className="footer-column">
              <h4>Resources</h4>
              <ul>
                <li><a href="#">Documentation</a></li>
                <li><a href="#">Support</a></li>
                <li><a href="#">API</a></li>
                <li><a href="#">Status</a></li>
              </ul>
            </div>
            <div className="footer-column">
              <h4>Legal</h4>
              <ul>
                <li><a href="#">Privacy</a></li>
                <li><a href="#">Terms</a></li>
                <li><a href="#">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© 2025 ByeTalk. All rights reserved.</p>
            <div className="footer-social">
              <a href="#">𝕏</a>
              <a href="#">in</a>
              <a href="#">◉</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
