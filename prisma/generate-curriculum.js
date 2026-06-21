import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error('❌ Error: GEMINI_API_KEY is not defined in the environment variables!');
  console.log('💡 Please add GEMINI_API_KEY=your_api_key to your backend/.env file.');
  process.exit(1);
}

// Full 34 Modules definitions
const MODULES = [
  { number: 1, title: "Money Basics", icon: "🌱" },
  { number: 2, title: "Introduction to Share Market", icon: "📈" },
  { number: 3, title: "History of Stock Market", icon: "📜" },
  { number: 4, title: "Market Structure", icon: "🏗" },
  { number: 5, title: "Market Participants", icon: "👥" },
  { number: 6, title: "Demat & Trading Accounts", icon: "🔑" },
  { number: 7, title: "How Orders Work", icon: "⚡" },
  { number: 8, title: "Stock Categories & Caps", icon: "🏷" },
  { number: 9, title: "Corporate Actions", icon: "📢" },
  { number: 10, title: "Reading Stock Data", icon: "📊" },
  { number: 11, title: "Fundamental Analysis", icon: "🔍" },
  { number: 12, title: "Financial Statements", icon: "📄" },
  { number: 13, title: "Ratio Analysis", icon: "🧮" },
  { number: 14, title: "Management Analysis", icon: "👔" },
  { number: 15, title: "Valuation & Margin of Safety", icon: "💎" },
  { number: 16, title: "Technical Analysis Basics", icon: "📉" },
  { number: 17, title: "Chart Patterns", icon: "📐" },
  { number: 18, title: "Trading Styles", icon: "⏱" },
  { number: 19, title: "Risk Management", icon: "🛡" },
  { number: 20, title: "Trading Psychology", icon: "🧠" },
  { number: 21, title: "Mutual Funds", icon: "🧺" },
  { number: 22, title: "Exchange Traded Funds (ETFs)", icon: "🌐" },
  { number: 23, title: "Bonds and Debt Markets", icon: "💵" },
  { number: 24, title: "Derivatives Introduction", icon: "🔗" },
  { number: 25, title: "Options Trading & Greeks", icon: "🎲" },
  { number: 26, title: "Portfolio Management", icon: "💼" },
  { number: 27, title: "Macroeconomics", icon: "🏛" },
  { number: 28, title: "Sector Analysis", icon: "🏭" },
  { number: 29, title: "Global Markets", icon: "🌍" },
  { number: 30, title: "Advanced Investing", icon: "🧙‍♂️" },
  { number: 31, title: "Professional Analysis", icon: "🔬" },
  { number: 32, title: "Taxation on Stocks", icon: "💸" },
  { number: 33, title: "Investor Protection & Scams", icon: "👮" },
  { number: 34, title: "Capstone Project", icon: "🎓" }
];

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${API_KEY}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.statusText} - ${err}`);
  }

  const result = await response.json();
  const text = result.candidates[0].content.parts[0].text;
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error("❌ JSON parse error! Raw response text was:");
    console.error(text);
    throw err;
  }
}

function getPromptForLevel(level) {
  return `You are the world's best stock market educator, fintech learning architect, and gamification expert.
Create a set of 3 comprehensive Duolingo-style lessons for the module "Level ${level.number}: ${level.title}".

For each lesson, generate high-quality educational content following these guidelines:
1. Explain as if teaching a 15-year-old Indian student with zero finance background. Use extremely simple, clear, and engaging language.
2. Use relatable Indian analogies (chai shops, dhabas, kirana stores, cricket teams, Mumbai local trains, school canteens).
3. Strictly do NOT give buy/sell recommendations or specific stock tips.
4. Keep the core explanation under 300 words, using clear markdown subheadings (####).
5. Ground your content in the following source materials, applying them specifically to the context of this level:
   - Official Indian Sources: SEBI Investor Education (rights, IPOs, mutual funds, fraud awareness), NSE Academy & Investor Education (market basics, trading, technical analysis, derivatives), NISM certification material (investment concepts, risk management, equity research), and BSE Investor Education (corporate actions, market functioning).
   - Core Books: Beginner mindset (The Psychology of Money by Morgan Housel, Rich Dad Poor Dad by Robert Kiyosaki, The Little Book of Common Sense Investing by John Bogle); Intermediate (One Up on Wall Street by Peter Lynch, The Intelligent Investor by Benjamin Graham, Common Stocks and Uncommon Profits by Philip Fisher); Advanced (Security Analysis by Graham & Dodd, Essays of Warren Buffett, Competition Demystified by Bruce Greenwald); Technical Analysis (Steve Nison's Japanese Candlestick Charting, John Murphy's Technical Analysis of Financial Markets); Trading Psychology (Trading in the Zone by Mark Douglas).
   - Real Indian Company Data: Use simplified real examples from top companies (TCS, Reliance Industries, Infosys, HDFC Bank, Asian Paints, ITC) to explain Revenue, Profit, Cash flow, Risks, and Management Discussion. Break down real Balance Sheets, Profit & Loss, Cash Flow Statements, Notes to Accounts, and Investor Presentations into simple visuals and exercises. Include beginner-friendly summaries of earnings conference calls (e.g. why profits fell or rose, stock price reactions).
   - Macroeconomics & Policy: RBI resources (Inflation, Repo rate, Monetary policy, Banking, Currency) and Government documents (Union Budget, Economic Survey, Finance Ministry publications).
   - International & Academic References: Warren Buffett's shareholder letters, Berkshire Hathaway annual reports, CFA Institute material, Investopedia definitions, and simplified academic research on behavioral finance, market efficiency, and portfolio theory.
   - News-Based Learning: Frame concepts using real market dynamics (e.g. "Why did banking stocks rise today?", "What happens when RBI cuts the repo rate?", "How does crude oil affect airline companies?").

The JSON output must strictly match this schema:
{
  "lessons": [
    {
      "id": "L${level.number}_01",
      "lessonNumber": 1,
      "title": "Clean, engaging lesson title",
      "readTime": "3 min",
      "xpReward": 30,
      "learningObjective": "One-line clear learning goal",
      "hook": "An intriguing, curiosity-provoking question (20-30 words)",
      "story": "A relatable story/analogy set in India explaining the concept",
      "visualSuggestion": "Description of suggested graphics/animations",
      "coreExplanation": "Clear explanation in simple language, using subheadings starting with ####",
      "didYouKnow": "One surprising/fun financial fact",
      "indianExample": "A real-world example from the Indian context",
      "interactiveHint": "Description of a mini-game/interactive activity",
      "memoryTrick": "A simple mnemonic or memory trick",
      "recap": ["Point 1", "Point 2", "Point 3", "Point 4", "Point 5"],
      "unlockMessage": "Encouraging message + teaser for next lesson",
      "quiz": {
        "questions": [
          {
            "type": "MCQ",
            "question": "Clear MCQ question?",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correctAnswer": 1,
            "explanation": "Detailed explanation of why Option B is correct"
          },
          {
            "type": "True/False",
            "question": "True/False question?",
            "options": ["True", "False"],
            "correctAnswer": 0,
            "explanation": "Explanation of correct boolean choice"
          },
          {
            "type": "Scenario",
            "scenario": "Setting a situation...",
            "question": "What should you do?",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correctAnswer": 2,
            "explanation": "Why Option C is correct"
          }
        ]
      }
    }
  ]
}

Ensure the output contains exactly 3 lessons, sequentially numbered. The quiz must contain exactly 8 unique, high-quality questions (a mix of MCQ, True/False, and Scenario types). Return ONLY valid JSON, no markdown wrappers.`;
}

async function generate() {
  const args = process.argv.slice(2);
  let startLevel = 1;
  let endLevel = 1;
  let levelsToRun = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start' && args[i+1]) startLevel = parseInt(args[i+1]);
    if (args[i] === '--end' && args[i+1]) endLevel = parseInt(args[i+1]);
    if (args[i] === '--levels' && args[i+1]) {
      levelsToRun = args[i+1].split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
    }
  }

  if (!levelsToRun) {
    levelsToRun = [];
    for (let i = startLevel; i <= endLevel; i++) {
      levelsToRun.push(i);
    }
  }

  console.log(`🚀 Starting content generation for levels: ${levelsToRun.join(', ')}...`);

  for (const i of levelsToRun) {
    const level = MODULES.find(m => m.number === i);
    if (!level) continue;

    console.log(`⏳ Generating Level ${i}: ${level.title}...`);
    
    let success = false;
    let retries = 3;
    let delay = 10000; // start with 10s wait on error

    while (!success && retries > 0) {
      try {
        const result = await callGemini(getPromptForLevel(level));
        
        const fileName = `level_${i}_lessons.json`;
        const filePath = path.join(process.cwd(), 'prisma', 'staging', fileName);
        
        // Ensure staging dir exists
        if (!fs.existsSync(path.join(process.cwd(), 'prisma', 'staging'))) {
          fs.mkdirSync(path.join(process.cwd(), 'prisma', 'staging'));
        }

        fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
        console.log(`✅ Successfully generated and saved to: prisma/staging/${fileName}`);
        success = true;
        
        // Sleep to respect rate limits
        await new Promise(r => setTimeout(r, 6000));
      } catch (e) {
        retries--;
        console.error(`⚠️ Attempt failed for Level ${i}: ${e.message}`);
        if (retries > 0) {
          console.log(`⏳ Waiting ${delay / 1000}s before retry... (${retries} retries left)`);
          await new Promise(r => setTimeout(r, delay));
          delay *= 2; // exponential backoff
        } else {
          console.error(`❌ Failed generating Level ${i} after all attempts.`);
        }
      }
    }
  }
  
  console.log('🏁 Content generation completed!');
}

generate().catch(console.error);


