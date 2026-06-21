export function getSeedLessons() {
  return {
    levels: [
      { number: 1, title: "Money Basics", description: "Learn about money, saving vs investing, inflation, and compounding.", icon: "🌱" },
      { number: 2, title: "Introduction to Share Market", description: "Understand companies, ownership, shares, and market sentiments.", icon: "📈" },
      { number: 3, title: "History of Stock Market", description: "Explore the global and Indian history of exchanges like BSE and NSE.", icon: "📜" },
      { number: 4, title: "Market Structure", description: "Demystify primary vs secondary markets, IPOs, and corporate listings.", icon: "🏗️" },
      { number: 5, title: "Market Participants", description: "Meet retail investors, institutional giants (FII/DII), and SEBI.", icon: "👥" },
      { number: 6, title: "Demat & Trading Accounts", description: "Understand PAN, KYC, and setting up demat accounts with NSDL/CDSL.", icon: "🔑" },
      { number: 7, title: "How Orders Work", description: "Master buy/sell orders, market vs limit, and stop loss mechanisms.", icon: "⚡" },
      { number: 8, title: "Stock Categories & Caps", description: "Learn about large/mid/small cap, growth vs value, and penny stocks.", icon: "🏷️" },
      { number: 9, title: "Corporate Actions", description: "Understand dividends, bonus shares, stock splits, and buybacks.", icon: "📢" },
      { number: 10, title: "Reading Stock Data", description: "Decode OHLC, volume, circuit limits, and 52-week highs.", icon: "📊" },
      { number: 11, title: "Fundamental Analysis", description: "Analyze revenues, expenses, EBITDA, and economic moats.", icon: "🔍" },
      { number: 12, title: "Financial Statements", description: "Read balance sheets, profit & loss, and annual reports.", icon: "📄" },
      { number: 13, title: "Ratio Analysis", description: "Understand P/E, P/B, ROE, ROCE, and debt-to-equity ratios.", icon: "🧮" },
      { number: 14, title: "Management Analysis", description: "Evaluate promoter holding, governance quality, and red flags.", icon: "👔" },
      { number: 15, title: "Valuation & Margin of Safety", description: "Determine intrinsic value and relative multiples valuation.", icon: "💎" },
      { number: 16, title: "Technical Analysis Basics", description: "Read candlesticks, trends, support, resistance, and volume.", icon: "📉" },
      { number: 17, title: "Chart Patterns", description: "Identify double tops, head and shoulders, flags, and wedges.", icon: "📐" },
      { number: 18, title: "Trading Styles", description: "Compare intraday, swing, positional trading, and scalping.", icon: "⏱️" },
      { number: 19, title: "Risk Management", description: "Master position sizing, risk-reward ratios, and stop losses.", icon: "🛡️" },
      { number: 20, title: "Trading Psychology", description: "Overcome fear, greed, FOMO, and revenge trading.", icon: "🧠" },
      { number: 21, title: "Mutual Funds", description: "Learn about NAV, SIP, active vs passive index funds.", icon: "🧺" },
      { number: 22, title: "Exchange Traded Funds (ETFs)", description: "Explore gold, index, and sector ETFs and how they trade.", icon: "🌐" },
      { number: 23, title: "Bonds and Debt Markets", description: "Understand treasury bills, coupons, yields, and duration.", icon: "💵" },
      { number: 24, title: "Derivatives Introduction", description: "Learn the basics of futures, options, hedging, and leverage.", icon: "🔗" },
      { number: 25, title: "Options Trading & Greeks", description: "Understand strike price, premium, option chains, and Greeks.", icon: "🎲" },
      { number: 26, title: "Portfolio Management", description: "Master asset allocation, diversification, and rebalancing.", icon: "💼" },
      { number: 27, title: "Macroeconomics", description: "Understand GDP, repo rates, monetary policy, and budgets.", icon: "🏛️" },
      { number: 28, title: "Sector Analysis", description: "Analyze banking, IT, FMCG, pharma, auto, and energy sectors.", icon: "🏭" },
      { number: 29, title: "Global Markets", description: "Compare Dow Jones, Nasdaq, and global capital flows.", icon: "🌍" },
      { number: 30, title: "Advanced Investing", description: "Discover value, contrarian, momentum, and Coffee Can investing.", icon: "🧙‍♂️" },
      { number: 31, title: "Professional Analysis", description: "Review conference calls, investor presentations, and credit ratings.", icon: "🔬" },
      { number: 32, title: "Taxation on Stocks", description: "Learn about short/long term capital gains and dividend taxes.", icon: "💸" },
      { number: 33, title: "Investor Protection & Scams", description: "Spot pump-and-dumps, fake advisor groups, and Telegram scams.", icon: "👮" },
      { number: 34, title: "Capstone Project", description: "Analyze a real annual report and build a mock portfolio.", icon: "🎓" }
    ],
    lessons: [
      // === LEVEL 1: MONEY BASICS ===
      {
        id: "L1_01",
        levelNumber: 1,
        lessonNumber: 1,
        title: "What is Money and Why It Matters",
        readTime: "3 min",
        xpReward: 30,
        learningObjective: "Understand the concept of money as trust, barter limitations, and the impact of inflation.",
        hook: "Why does a piece of printed paper buy you a hot plate of Momos, but a tree leaf doesn't? Let's crack the code of money!",
        story: "Aarav loves Raju Da's butter chicken. He pays Raju Da ₹300. Raju Da uses the same ₹300 to buy chicken from the market, and the vendor uses it to buy mobile data. Money is just a magic token of trust that everyone agrees has value!",
        visualSuggestion: "Animation showing a ₹500 note moving from a customer to a shopkeeper, transforming into groceries, then moving to a supplier.",
        coreExplanation: "#### 💸 The Trust Token\nMoney is simply a **medium of exchange**. Before money, people used the **barter system** (exchanging cows for wheat, or shoes for chickens). But barter was hard: what if the shoemaker didn't want your chickens? Money solved this.\n\nMoney works because of **collective trust**—everyone in India trusts that the Reserve Bank of India (RBI) guarantees the value of the paper note.\n\n#### 📉 The Danger of Idle Cash\nKeeping your cash under the mattress actually *loses* value. This is because of a silent thief called **Inflation**, which makes goods and services more expensive over time. To keep your wealth, you must grow it!",
        didYouKnow: "In ancient times, people used salt, tea bricks, and even giant stones as currency!",
        indianExample: "A cup of cutting chai that cost ₹5 a decade ago now costs ₹15. The chai didn't change, but the purchasing power of your rupee shrank!",
        interactiveHint: "Drag and drop items: match Barter with 'Cows for Wheat' and Fiat Money with 'RBI Guaranteed Notes'.",
        memoryTrick: "Money is like **water**—if it sits still under a mattress, it gets stagnant. It needs to flow (invested) to stay fresh and grow.",
        recap: JSON.stringify([
          "Money is a token of collective trust.",
          "The barter system failed due to double coincidence of wants.",
          "Inflation reduces the purchasing power of money.",
          "Idle cash loses real value over time.",
          "Investing helps beat inflation."
        ]),
        unlockMessage: "Congratulations! You have taken your first step towards financial literacy. Ready to see how money grows?",
        quiz: JSON.stringify({
          questions: [
            {
              type: "MCQ",
              question: "Why does a paper currency note have value?",
              options: [
                "It is printed on actual gold leaf",
                "The Reserve Bank of India (RBI) guarantees its value and we all trust it",
                "It is extremely rare to find",
                "It can be eaten in an emergency"
              ],
              correctAnswer: 1,
              explanation: "Fiat money has value because the central government/RBI guarantees it and society trusts that guarantee as a medium of exchange."
            },
            {
              type: "True/False",
              question: "Keeping cash in a safe locker at home protects it from losing value.",
              options: ["True", "False"],
              correctAnswer: 1,
              explanation: "False. Inflation causes prices to rise over time, meaning the same amount of cash will buy fewer things in the future."
            },
            {
              type: "Scenario",
              scenario: "You find a ₹1,000 note in an old book from 10 years ago. The price of cinema tickets has doubled since then.",
              question: "What happened to the value of your ₹1,000 note?",
              options: [
                "It can buy the same amount of tickets",
                "It can buy twice as many tickets",
                "It can buy half as many tickets",
                "It has expired and is worth zero"
              ],
              correctAnswer: 2,
              explanation: "Because inflation has doubled ticket prices, your ₹1,000 note has lost half of its real purchasing power."
            }
          ]
        })
      },
      {
        id: "L1_02",
        levelNumber: 1,
        lessonNumber: 2,
        title: "The Magic of Compounding",
        readTime: "4 min",
        xpReward: 35,
        learningObjective: "Understand compound interest, the exponential growth curve, and the importance of starting early.",
        hook: "Would you rather have ₹10 Lakhs in cash today, or a magic 1-paisa coin that doubles in value every day for 30 days?",
        story: "Think of a small snowball rolling down a mountain in Shimla. At first, it's tiny. But as it rolls, it collects snow, gets heavier, and grows exponentially. By the bottom, it's a massive, unstoppable force. Compounding is that snowball!",
        visualSuggestion: "A graph showing a flat line that suddenly curves sharply upward, representing the difference between simple interest and compound interest.",
        coreExplanation: "#### 🚀 Interest on Interest\nSimple interest gives you returns only on your original money. **Compound interest** gives you returns on your original money *plus* the returns you've already earned. Your money's earnings start earning their own earnings!\n\n#### ⏳ The Power of Time\nTime is the secret ingredient. In the early years, compounding looks slow and boring. But in the later years, the curve shoots up like a rocket. The earlier you start, the more cycles of doubling your money gets.",
        didYouKnow: "Albert Einstein reportedly called compound interest the 'Eighth Wonder of the World'. He said: 'He who understands it, earns it... he who doesn't... pays it.'",
        indianExample: "If you invest ₹5,000 every month starting at age 20, by age 50 you could have over ₹1.7 Crore (at 12% return). If you wait until age 30 to start, you'll end up with only around ₹50 Lakhs!",
        interactiveHint: "Slide a timeline: watch ₹10,000 grow slowly in years 1-5, then shoot up exponentially from years 15-30.",
        memoryTrick: "Compounding is like **planting a mango tree**—it takes years of watering with no fruit, but once it matures, it gives mangoes for decades.",
        recap: JSON.stringify([
          "Compounding is earning returns on returns.",
          "Time is more important than the amount of money you start with.",
          "Starting early gives your money more doubling cycles.",
          "Consistently investing small amounts leads to huge wealth.",
          "Simple interest grows linearly; compound interest grows exponentially."
        ]),
        unlockMessage: "Amazing job! You now understand the greatest secret of wealth building. Let's step into the stock market next!",
        quiz: JSON.stringify({
          questions: [
            {
              type: "MCQ",
              question: "What is compound interest?",
              options: [
                "Interest paid only on your initial deposit",
                "Interest paid on the initial deposit plus accumulated interest",
                "Interest that is paid twice a year",
                "A flat fee charged by brokers"
              ],
              correctAnswer: 1,
              explanation: "Compound interest is interest calculated on the initial principal and also on the accumulated interest of previous periods."
            },
            {
              type: "True/False",
              question: "In compounding, the amount of time you leave your money invested matters more than the starting amount.",
              options: ["True", "False"],
              correctAnswer: 0,
              explanation: "True. Because compounding is exponential, time is the multiplier. A smaller amount invested for a longer period can easily beat a larger amount invested for a short period."
            },
            {
              type: "Scenario",
              scenario: "Priya starts investing ₹2,000/month at age 22, and Rahul starts investing ₹5,000/month at age 35.",
              question: "Assuming they get the same returns, who will likely have a larger corpus at age 55?",
              options: [
                "Rahul, because he invests more money per month",
                "Priya, because her money has compounded for 13 years longer",
                "They will have the exact same amount",
                "Neither, they will lose money"
              ],
              correctAnswer: 1,
              explanation: "Priya's extra 13 years of compounding time gives her investment much more time to double, outweighing Rahul's higher monthly contributions."
            }
          ]
        })
      },

      // === LEVEL 2: INTRODUCTION TO SHARE MARKET ===
      {
        id: "L2_01",
        levelNumber: 2,
        lessonNumber: 1,
        title: "What is a Share?",
        readTime: "3 min",
        xpReward: 30,
        learningObjective: "Understand shares, company ownership structure, and the concept of becoming a shareholder.",
        hook: "Ever wanted to tell your friends: 'Yeah, I own a part of Zomato'? Well, you actually can! Let's find out how.",
        story: "Imagine your friend Rohit wants to start a luxury chai cafe. It costs ₹1,00,000. He doesn't have it, so he divides the ownership into 1,000 equal slices of ₹100 each. Each slice is a **share**. If you buy 10 shares for ₹1,000, you own 1% of the cafe!",
        visualSuggestion: "A giant pizza representing a company being sliced into thousands of tiny pieces, with one piece labeled 'Your Share'.",
        coreExplanation: "#### 🍰 Fractional Ownership\nA **share** (or stock) represents fractional ownership in a business. When you buy a share of a company like Reliance or Infosys, you buy a tiny slice of that company.\n\n#### 👑 Being a Shareholder\nAs a shareholder, you are a co-owner! If the company makes profits, the value of your share goes up. Sometimes, the company distributes cash directly to you, called **Dividends**.\n\nBut remember, if the company does poorly, the value of your slice shrinks too. You share both the success and the risks.",
        didYouKnow: "The oldest stock exchange in the world started in Amsterdam in 1602, trading shares of the Dutch East India Company!",
        indianExample: "If you bought 1 share of Tata Motors in 2020 for around ₹120, that same share would be worth over ₹900 in 2024 because Tata EV sales boomed!",
        interactiveHint: "Tap on Zomato, Tata, and Reliance logo cards to reveal how many millions of shares they have divided themselves into.",
        memoryTrick: "A share is a **slice of pizza**—the bigger the pizza grows, the larger and more filling your slice becomes.",
        recap: JSON.stringify([
          "A share represents a unit of ownership in a company.",
          "Companies issue shares to raise money to grow.",
          "Owning a share makes you a shareholder or co-owner.",
          "Shareholders can earn profits via price rises and dividends.",
          "Investing in shares involves risk if the company fails."
        ]),
        unlockMessage: "Awesome! You are now officially conceptualizing equity ownership. Let's see why stock prices move up and down!",
        quiz: JSON.stringify({
          questions: [
            {
              type: "MCQ",
              question: "What do you buy when you buy a stock share?",
              options: [
                "A loan certificate to the company",
                "A slice of ownership in the company",
                "A product manufactured by the company",
                "A membership card for discounts"
              ],
              correctAnswer: 1,
              explanation: "Buying a share means you buy a piece of equity or fractional ownership in that business."
            },
            {
              type: "True/False",
              question: "If a company goes bankrupt, shareholders are personally responsible for paying all the company debts.",
              options: ["True", "False"],
              correctAnswer: 1,
              explanation: "False. Shareholder liability is limited. The maximum you can lose is the money you invested in buying the shares."
            }
          ]
        })
      },
      {
        id: "L2_02",
        levelNumber: 2,
        lessonNumber: 2,
        title: "Bulls vs Bears: Market Sentiments",
        readTime: "3 min",
        xpReward: 30,
        learningObjective: "Understand market trends, identifying bull and bear markets, and the psychology behind them.",
        hook: "Why are stock investors obsessed with Horns and Claws? Meet the two mascots of the stock market!",
        story: "Walk into any trading room, and you'll hear about Bulls and Bears. Think of a **Bull** attacking—it thrusts its horns *up* into the air. Now think of a **Bear** attacking—it swipes its claws *down* to the ground. That's market direction!",
        visualSuggestion: "A cartoon illustration showing a bull charging up a green hill and a bear sliding down a red cliff.",
        coreExplanation: "#### 🐂 The Bull Market (Green & Happy)\nWhen investors are optimistic, expecting the economy to grow and corporate profits to soar, they buy stocks. This high demand pushes prices up. This upward trend is a **Bull Market**.\n\n#### 🐻 The Bear Market (Red & Fearful)\nWhen there is fear, recession, or bad news, investors panic and sell stocks to protect their cash. This high supply pushes prices down. This downward trend is a **Bear Market**.",
        didYouKnow: "The famous charging bull statue near the Bombay Stock Exchange (BSE) at Dalal Street weighs over 4.5 tonnes!",
        indianExample: "During the 2020 COVID outbreak, the Indian market crashed into a Bear Market. But soon after, it entered a massive Bull Market, hitting record highs by 2021 as recovery began.",
        interactiveHint: "Swipe green arrows up for Bullish indicators (high sales, GDP growth) and red arrows down for Bearish indicators (wars, high inflation).",
        memoryTrick: "Bulls look **UP** to the sky (rising prices). Bears look **DOWN** at their paws (falling prices).",
        recap: JSON.stringify([
          "Bull market refers to rising stock prices and optimism.",
          "Bear market refers to falling stock prices and pessimism.",
          "The names come from the physical way each animal attacks.",
          "Market sentiment is driven by economic news and psychology.",
          "Both bull and bear phases are natural parts of market cycles."
        ]),
        unlockMessage: "Incredible! You can now speak the language of market professionals. Let's see how companies get listed on the stock exchange next!",
        quiz: JSON.stringify({
          questions: [
            {
              type: "MCQ",
              question: "What is happening during a Bull Market?",
              options: [
                "Stock prices are generally falling and panic is high",
                "Stock prices are generally rising and confidence is strong",
                "Trading is completely suspended",
                "Only agricultural companies are traded"
              ],
              correctAnswer: 1,
              explanation: "A bull market is characterized by optimism, buying activity, and rising stock prices."
            },
            {
              type: "True/False",
              question: "A Bear Market is a permanent state where stocks will never recover.",
              options: ["True", "False"],
              correctAnswer: 1,
              explanation: "False. Bear markets are temporary phases of contraction. Historically, markets have always recovered and entered new bull phases."
            }
          ]
        })
      },

      // === LEVEL 3: HISTORY OF STOCK MARKET ===
      {
        id: "L3_01",
        levelNumber: 3,
        lessonNumber: 1,
        title: "BSE and NSE: India's Exchange Pillars",
        readTime: "3 min",
        xpReward: 30,
        learningObjective: "Understand the differences between BSE and NSE and their histories.",
        hook: "How did a giant stock exchange grow from a group of brokers sitting under a banyan tree?",
        story: "In the 1850s, a few brokers gathered under a leafy banyan tree in Mumbai's Town Hall to trade stocks. Over decades, this casual gathering evolved into the mighty Bombay Stock Exchange (BSE). In 1992, the National Stock Exchange (NSE) arrived, bringing computers and modern screen-based trading to all of India.",
        visualSuggestion: "Contrast image of a banyan tree with brokers and a modern server room blinking with digital transaction lines.",
        coreExplanation: "#### 🏛️ The Infrastructure of Trading\nStock exchanges are the marketplaces where companies get traded. In India, **BSE** and **NSE** are the two main pillars. \n\n* **BSE (Bombay Stock Exchange):** Asia's oldest exchange, famous for its **Sensex** index. Dalal Street is its iconic home.\n* **NSE (National Stock Exchange):** Established to bring transparency and technology. It introduced fully automated electronic trading, making paper stock certificates obsolete. Its core index is the **Nifty 50**.",
        didYouKnow: "BSE is the world's fastest stock exchange, with a median trade speed of just 6 microseconds!",
        indianExample: "BSE trades over 5,000 listed companies, whereas the younger NSE trades around 2,000, but NSE handles much higher daily transaction volumes.",
        interactiveHint: "Match BSE to 'Oldest / Sensex' and NSE to 'Electronic Pioneer / Nifty'.",
        memoryTrick: "BSE is like the **grandparent** (wise, historic, has more companies). NSE is like the **tech-savvy grandchild** (fast, digital, handles more volume).",
        recap: JSON.stringify([
          "Exchanges are digital marketplaces for shares.",
          "BSE is Dalal Street's historic icon, founded under a tree.",
          "NSE revolutionized Indian markets with digital screens in 1992.",
          "BSE tracks Sensex; NSE tracks Nifty 50.",
          "Both exchanges offer fair trading and price discovery."
        ]),
        unlockMessage: "Super! Now you know where shares trade. Let's see how new companies enter these exchanges!",
        quiz: JSON.stringify({
          questions: [
            {
              type: "MCQ",
              question: "Which exchange is the oldest in Asia?",
              options: ["NSE", "BSE", "Nasdaq", "London Stock Exchange"],
              correctAnswer: 1,
              explanation: "BSE was founded in 1875, making it the oldest stock exchange in Asia."
            },
            {
              type: "True/False",
              question: "NSE was created to introduce fully electronic, screen-based trading to India.",
              options: ["True", "False"],
              correctAnswer: 0,
              explanation: "True. NSE revolutionized the Indian stock market in 1992 by making trading paperless and electronic."
            }
          ]
        })
      },

      // === SEED ALL LEVELS 4 TO 34 WITH DRAFT LESSONS FOR PATH RENDERING ===
      ...Array.from({ length: 31 }, (_, idx) => {
        const levelNum = idx + 4;
        const levelTitles = [
          "", "", "", // skip 1-3
          "Market Structure",
          "Market Participants",
          "Demat & Trading Accounts",
          "How Orders Work",
          "Stock Categories & Caps",
          "Corporate Actions",
          "Reading Stock Data",
          "Fundamental Analysis",
          "Financial Statements",
          "Ratio Analysis",
          "Management Analysis",
          "Valuation & Margin of Safety",
          "Technical Analysis Basics",
          "Chart Patterns",
          "Trading Styles",
          "Risk Management",
          "Trading Psychology",
          "Mutual Funds",
          "Exchange Traded Funds (ETFs)",
          "Bonds and Debt Markets",
          "Derivatives Introduction",
          "Options Trading & Greeks",
          "Portfolio Management",
          "Macroeconomics",
          "Sector Analysis",
          "Global Markets",
          "Advanced Investing",
          "Professional Analysis",
          "Taxation on Stocks",
          "Investor Protection & Scams",
          "Capstone Project"
        ];
        
        return {
          id: `L${levelNum}_01`,
          levelNumber: levelNum,
          lessonNumber: 1,
          title: `Intro to ${levelTitles[levelNum - 1]}`,
          readTime: "3 min",
          xpReward: 30,
          learningObjective: `Learn the fundamentals of ${levelTitles[levelNum - 1]}.`,
          hook: `Ready to explore ${levelTitles[levelNum - 1]}? Let's check it out!`,
          story: `This lesson covers the core basics of ${levelTitles[levelNum - 1]} with practical examples and case studies.`,
          visualSuggestion: `Illustration representing ${levelTitles[levelNum - 1]}.`,
          coreExplanation: `#### 📚 Introduction\nIn this section, we cover the vital concepts of **${levelTitles[levelNum - 1]}**.\n\nUnderstanding this is crucial for building a strong foundation in investing and trading. We will explore key terminology, core mechanics, and look at practical examples.`,
          didYouKnow: "Every financial term exists to make complex asset swaps simpler for everyday citizens.",
          indianExample: `Real-life case studies of Indian corporations applying these ${levelTitles[levelNum - 1]} principles.`,
          interactiveHint: "Answer the quiz questions below to test your baseline knowledge.",
          memoryTrick: `Remember this as a key building block in your Moolzen curriculum path.`,
          recap: JSON.stringify([
            `Explored the core definitions of ${levelTitles[levelNum - 1]}.`,
            "Learned why it plays a critical role in capital markets.",
            "Reviewed simple case scenarios.",
            "Identified potential risks.",
            "Prepared for advanced lessons."
          ]),
          unlockMessage: "Fantastic progress! You've successfully unlocked the next level.",
          quiz: JSON.stringify({
            questions: [
              {
                type: "MCQ",
                question: `What is the primary topic of this module?`,
                options: [
                  "Cricket",
                  "Chai making",
                  levelTitles[levelNum - 1],
                  "Local farming"
                ],
                correctAnswer: 2,
                explanation: `This module introduces the key concepts of ${levelTitles[levelNum - 1]}.`
              },
              {
                type: "True/False",
                question: `Studying ${levelTitles[levelNum - 1]} is essential for complete financial literacy.`,
                options: ["True", "False"],
                correctAnswer: 0,
                explanation: "True. To be a successful investor, you must understand all aspects of market structure and financial concepts."
              }
            ]
          })
        };
      })
    ]
  };
}
