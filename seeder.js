/**
 * seeder.js
 * Run once to create the default admin account and sample CMS content.
 * Usage: node seeder.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User.model');
const CMS  = require('./models/CMS.model');

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅  Connected to MongoDB');

  // ── Admin account ────────────────────────────────────────────────────────────
  const existing = await User.findOne({ email: process.env.ADMIN_EMAIL });
  if (!existing) {
    await User.create({
      name:     'Super Admin',
      email:    process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      role:     'admin',
    });
    console.log(`✅  Admin created: ${process.env.ADMIN_EMAIL}`);
  } else {
    console.log('ℹ️   Admin already exists — skipping');
  }

  // ── Sample agent ─────────────────────────────────────────────────────────────
  const agentExists = await User.findOne({ email: 'agent1@support.com' });
  if (!agentExists) {
    await User.create({
      name: 'Support Agent 1',
      email: 'agent1@support.com',
      password: 'Agent@12345',
      role: 'agent',
      department: 'Technical',
    });
    console.log('✅  Sample agent created: agent1@support.com / Agent@12345');
  }

  // ── Sample CMS content ───────────────────────────────────────────────────────
  const homepageExists = await CMS.findOne({ slug: 'homepage' });
  if (!homepageExists) {
    await CMS.create({
      slug: 'homepage',
      title: 'Homepage',
      type: 'page',
      isPublished: true,
      publishedAt: new Date(),
      content: {
        hero: {
          heading: 'Expert Printer Support, Anytime',
          subheading: 'Get instant help for all printer brands — HP, Canon, Epson, Brother and more.',
          ctaText: 'Chat with an Expert',
          ctaLink: '#chat',
        },
        sections: [
          { title: 'Installation Help',    text: 'Step-by-step setup for any printer model.', order: 1 },
          { title: 'Driver Issues',        text: 'Fix driver conflicts and outdated software.',  order: 2 },
          { title: 'Network Printing',     text: 'WiFi, Ethernet, and Bluetooth connectivity.', order: 3 },
          { title: 'Ink & Toner Support',  text: 'Cartridge issues, streaks, and print quality.', order: 4 },
        ],
      },
    });
    console.log('✅  Homepage CMS content created');
  }

  const faqExists = await CMS.findOne({ slug: 'faqs' });
  if (!faqExists) {
    await CMS.create({
      slug: 'faqs',
      title: 'Frequently Asked Questions',
      type: 'faq',
      isPublished: true,
      publishedAt: new Date(),
      faqs: [
        { question: 'What printer brands do you support?',     answer: 'We support HP, Canon, Epson, Brother, Lexmark, Samsung and more.', order: 1 },
        { question: 'How quickly will an agent respond?',      answer: 'Agents typically respond within 2 minutes during business hours.', order: 2 },
        { question: 'Is the chat support free?',               answer: 'Yes, our live chat support is completely free for all customers.', order: 3 },
        { question: 'Can you help with wireless printer setup?', answer: 'Absolutely — our agents can walk you through WiFi and network setup.', order: 4 },
        { question: 'Do you offer remote assistance?',         answer: 'Yes, we can guide you remotely via chat or phone for complex issues.', order: 5 },
      ],
    });
    console.log('✅  FAQ CMS content created');
  }

  console.log('\n🎉  Seeding complete!');
  console.log('─────────────────────────────────────');
  console.log(`Admin login:  ${process.env.ADMIN_EMAIL} / ${process.env.ADMIN_PASSWORD}`);
  console.log('Agent login:  agent1@support.com / Agent@12345');
  console.log('─────────────────────────────────────');

  process.exit(0);
};

seed().catch((err) => {
  console.error('❌  Seeder error:', err.message);
  process.exit(1);
});
