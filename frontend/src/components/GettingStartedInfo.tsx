import React from 'react';
import './GettingStartedInfo.css';

const steps = [
  {
    icon: '🚀',
    title: 'Create or Join a Session',
    desc: "Start a new movie matching session, or join an existing one with a code."
  },
  {
    icon: '🤝',
    title: 'Invite Your Movie Buddy',
    desc: "Share your session code so your movie buddy can join and match with you."
  },
  {
    icon: '🎬',
    title: 'Start Swiping',
    desc: "Both users rate movies with ❤️ (Like) or ❌ (Pass) using a swipe interface."
  },
  {
    icon: '⚡',
    title: 'Get Instant Matches',
    desc: "When you both like the same movie, you'll get a match notification!"
  },
  {
    icon: '👤',
    title: 'View Your Profiles',
    desc: "See how your preferences evolve and what movies you both enjoy."
  },
  {
    icon: '🍿',
    title: 'Enjoy Movie Night!',
    desc: "Pick your matched movie and watch together."
  }
];

const aiPhases = [
  {
    icon: '🔍',
    title: 'Exploration',
    desc: "At first, you'll see a wide variety of movies to help the system learn your tastes."
  },
  {
    icon: '📚',
    title: 'Learning',
    desc: "As you swipe, MovieMatch gets smarter about what each of you likes."
  },
  {
    icon: '🎯',
    title: 'Perfect Match',
    desc: "After enough swipes, MovieMatch zeroes in on movies you're both likely to love!"
  }
];

const GettingStartedInfo: React.FC = () => (
  <section className="getting-started-info">
    <div className="hero-header">
      <h1 className="hero-title">🎬 MovieMatch</h1>
      <h2 className="hero-tagline">Find your next movie night match—together!</h2>
      <p className="hero-desc">
        MovieMatch helps you and your movie buddy discover movies you'll both love. Swipe, match, and enjoy personalized recommendations for the perfect movie night—no more endless scrolling!
      </p>
    </div>
    <h2 className="section-title">Getting Started</h2>
    <div className="steps-list">
      {steps.map((step, idx) => (
        <div className="step-card" key={idx}>
          <span className="step-number-badge">{idx + 1}</span>
          <span className="step-icon" aria-label={step.title}>{step.icon}</span>
          <div className="step-content">
            <h3>{step.title}</h3>
            <p>{step.desc}</p>
          </div>
        </div>
      ))}
    </div>
    <h2 className="section-title smarter-title">Smarter Movie Nights</h2>
    <div className="ai-phases-list">
      {aiPhases.map((phase, idx) => (
        <div className="ai-phase-card" key={idx}>
          <span className="ai-phase-icon" aria-label={phase.title}>{phase.icon}</span>
          <div className="ai-phase-content">
            <h3>{phase.title}</h3>
            <p>{phase.desc}</p>
          </div>
        </div>
      ))}
    </div>
    <div className="ai-bonus">
      <span role="img" aria-label="bonus">✨</span>
      <span>
        MovieMatch always looks for movies you'll both enjoy, not just one! The more you swipe, the better your recommendations get.
      </span>
    </div>
  </section>
);

export default GettingStartedInfo; 