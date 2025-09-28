import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(request) {
    try {
        const { dashboardType, data, month } = await request.json();

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
        }

        // Create dashboard-specific prompts
        const getPrompt = (type, data) => {
            const basePrompt = `You are a Motivational Marketing and Sales Expert who will help improve education sales team performance. Analyze the sales team data and provide exactly 3 focused, REALISTIC and ACHIEVABLE recommendations for daily actions that can be completed in one working day (8 hours). Target conversion rate: 5%. Include motivational and encouraging language. Return ONLY a valid JSON object with this structure:
      {
        "currentWeek": [
          "Today's Action Item 1: Realistic daily target that can be completed in 2-3 hours",
          "Today's Action Item 2: Realistic daily target that can be completed in 2-3 hours", 
          "Today's Action Item 3: Realistic daily target that can be completed in 2-3 hours"
        ],
        "nextWeek": [
          "Weekly Goal 1: Achievable weekly target based on daily capacity",
          "Weekly Goal 2: Achievable weekly target based on daily capacity",
          "Weekly Goal 3: Achievable weekly target based on daily capacity"
        ]
      }
      
      REALISTIC TARGET GUIDELINES:
      - Daily calls: 15-25 calls maximum (realistic for 8-hour day)
      - Daily demos: 2-4 demos maximum (each demo takes 30-45 minutes)
      - Daily follow-ups: 10-15 WhatsApp messages maximum
      - Focus on QUALITY over QUANTITY
      - Each task should be completable in 2-3 hours maximum
      - Consider human limitations and realistic conversion rates
      
      MOTIVATIONAL ELEMENTS:
      - Use encouraging and positive language
      - Include phrases like "You can do this!", "Great progress!", "Keep up the excellent work!"
      - Acknowledge achievements and potential
      - Use empowering action words like "Achieve", "Excel", "Succeed", "Win"
      - Focus on growth and improvement rather than just numbers
      
      FORMAT REQUIREMENTS:
      - Each recommendation must include REALISTIC NUMBERS that can be achieved in one day
      - Use format: "Today: Make 15 calls, schedule 2 demos, complete 1 demo"
      - Include time-bound action steps like "Morning: Call 8 parents, Afternoon: Follow up with 5 demos"
      - Focus on ACHIEVABLE DAILY TARGETS and REALISTIC WEEKLY GOALS
      
      EXAMPLES OF MOTIVATIONAL RECOMMENDATIONS:
      - "Today: You can achieve great results! Make 15 calls to parents (2 hours), schedule 2 demos (1 hour), complete 1 demo (45 minutes) - you've got this!"
      - "Today: Excel in your outreach! Call 10 parents before lunch, follow up with 3 scheduled demos, send 5 WhatsApp messages - keep up the excellent work!"
      - "This week: You're on track to succeed! Target 75 new parent contacts, complete 10 demos, close 2 sales - great progress ahead!"
      
      ROLE BOUNDARIES - ONLY provide recommendations for:
      - Daily call targets and customer acquisition goals
      - Demo scheduling and completion targets
      - Parent contact and follow-up action items
      - Weekly sales targets and performance goals
      - Specific conversation scripts and approaches
      
      DO NOT provide recommendations about:
      - Bonuses, rewards, or compensation
      - Gamification systems
      - Management decisions
      - HR policies
      - Team incentives or competitions
      - Salary or financial rewards
      
      ANALYZE CURRENT STATS: Look at conversion rates, demo completion rates, language performance, assignee performance, and identify specific bottlenecks.
      
      IMPROVEMENT FOCUS: Provide REALISTIC daily and weekly targets that can actually be completed. Focus on sustainable improvements rather than unrealistic goals. Consider:
      - Human capacity: 8-hour workday limitations
      - Quality over quantity: Better to do fewer, high-quality interactions
      - Realistic conversion rates: 2-5% is normal for education sales
      - Time management: Each task should have clear time allocation
      
      IMPORTANT: Each recommendation must be REALISTIC and ACHIEVABLE in one day. Format like: "Today: Make 15 calls (2 hours), schedule 2 demos (1 hour), complete 1 demo (45 minutes)" or "This week: Target 75 new contacts, complete 10 demos, close 2 sales"
      
      Keep each recommendation short (1-2 sentences max), realistic, and actionable for education sales team.`;

            switch (type) {
                case 'freesignup':
                    return `${basePrompt}
          
          EDUCATION SALES TEAM PERFORMANCE DATA:
          - Total Parent Contacts: ${data.totalContacts || 0}
          - Demo Requested by Parents: ${data.demoRequested || 0}
          - Demo Completed with Parents: ${data.demoCompleted || 0}
          - Enrollments Closed: ${data.salesCount || 0}
          - Parent Conversion Rate: ${data.conversionRate || 0}%
          - Assigned Parent Contacts: ${data.assignedContacts || 0}
          - Unassigned Parent Contacts: ${data.unassignedContacts || 0}
          - Parent Languages: ${JSON.stringify(data.languages || {})}
          - Average Daily Parent Contacts: ${data.avgDailyContacts || 0}
          
          Focus on: STATISTICAL ANALYSIS of current ${data.conversionRate || 0}% conversion rate and CONCRETE STRATEGIES to improve to 15-25%. Analyze language performance (${JSON.stringify(data.languages || {})}), assignee performance (${data.assignedContacts || 0} assigned vs ${data.unassignedContacts || 0} unassigned), and demo effectiveness (${data.demoRequested || 0} requested, ${data.demoCompleted || 0} completed).`;

                case 'compare':
                    return `${basePrompt}
          
          EDUCATION SALES TEAM COMPARISON DATA:
          - Sowmya's Parent Conversion: ${JSON.stringify(data.sowmya || {})}
          - Sukaina's Parent Conversion: ${JSON.stringify(data.sukaina || {})}
          
          Focus on: STATISTICAL COMPARISON between Sowmya (${JSON.stringify(data.sowmya || {})}) and Sukaina (${JSON.stringify(data.sukaina || {})}) performance. Identify which team member performs better in conversions, demos, and language targeting. Provide specific strategies to improve underperforming areas.`;

                case 'whatsapp':
                    return `${basePrompt}
          
          WHATSAPP EDUCATION SALES PERFORMANCE DATA:
          - Total Parent Contacts: ${data.totalContacts || 0}
          - Demo Requested by Parents: ${data.demoRequested || 0}
          - Demo Completed with Parents: ${data.demoCompleted || 0}
          - Parent Demo Conversion Rate: ${data.demoConversionRate || 0}%
          - Parent Languages: ${JSON.stringify(data.languages || {})}
          - Most Used Parent Language: ${data.mostUsedLanguage?.[0] || 'N/A'} (${data.mostUsedLanguage?.[1] || 0} parents)
          - Average Daily Parent Contacts: ${data.avgDailyContacts || 0}
          
          Focus on: WHATSAPP STATISTICAL ANALYSIS of ${data.demoConversionRate || 0}% demo conversion rate and strategies to improve to 20-30%. Analyze language performance (${JSON.stringify(data.languages || {})}), most effective language (${data.mostUsedLanguage?.[0] || 'N/A'} with ${data.mostUsedLanguage?.[1] || 0} users), and demo completion rates (${data.demoRequested || 0} requested, ${data.demoCompleted || 0} completed).`;

                default:
                    return `${basePrompt} Analyze this education sales data: ${JSON.stringify(data)}`;
            }
        };

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-exp",
            safetySettings: [
                {
                    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
            ],
            tools: [
                {
                    googleSearch: {}
                }
            ]
        });

        const prompt = getPrompt(dashboardType, data);

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Parse JSON response from AI
        let recommendations;
        try {
            // Clean the response to extract JSON
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                recommendations = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in response');
            }
        } catch (parseError) {
            console.error('Failed to parse AI response:', parseError);
            // Fallback to simple format
            recommendations = {
                currentWeek: [text.substring(0, 200) + "..."] || ["No recommendations available"],
                nextWeek: [text.substring(200, 400) + "..."] || ["No targets available"]
            };
        }

        // Filter out inappropriate recommendations
        const filterInappropriateRecommendations = (recommendations) => {
            const inappropriateKeywords = [
                'bonus', 'reward', 'gamify', 'gamification', 'incentive', 'compensation',
                'salary', 'pay', 'money', 'financial', 'prize', 'competition', 'contest',
                'management', 'hr', 'policy', 'decision', 'admin', 'administrative'
            ];

            const filterArray = (arr) => {
                return arr.filter(rec => {
                    const lowerRec = rec.toLowerCase();
                    return !inappropriateKeywords.some(keyword => lowerRec.includes(keyword));
                });
            };

            return {
                currentWeek: filterArray(recommendations.currentWeek || []),
                nextWeek: filterArray(recommendations.nextWeek || [])
            };
        };

        // Apply filtering
        recommendations = filterInappropriateRecommendations(recommendations);

        return NextResponse.json({
            recommendations,
            timestamp: new Date().toISOString(),
            dashboardType,
            month
        });

    } catch (error) {
        console.error('AI API Error:', error);
        return NextResponse.json({
            error: 'Failed to generate recommendations',
            details: error.message
        }, { status: 500 });
    }
}
