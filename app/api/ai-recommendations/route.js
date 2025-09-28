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
            const basePrompt = `You are an education sales coach specializing in selling to PARENTS and STUDENTS (grades 4-12). Analyze the sales team data and provide exactly 3 focused, actionable recommendations for EDUCATION SALES TEAM IMPROVEMENT in JSON format. Return ONLY a valid JSON object with this structure:
      {
        "currentWeek": [
          "Today's Action Item 1: Specific daily target with concrete steps",
          "Today's Action Item 2: Specific daily target with concrete steps", 
          "Today's Action Item 3: Specific daily target with concrete steps"
        ],
        "nextWeek": [
          "Weekly Goal 1: Specific target for the week",
          "Weekly Goal 2: Specific target for the week",
          "Weekly Goal 3: Specific target for the week"
        ]
      }
      
      FORMAT REQUIREMENTS:
      - Each recommendation must include SPECIFIC NUMBERS and TARGETS
      - Use format: "Today: Make 10 calls, get 2 customers, complete 3 demos"
      - Include concrete action steps like "Call 5 parents in the morning, follow up with 3 demos in afternoon"
      - Focus on DAILY TARGETS and WEEKLY GOALS
      
      EXAMPLES OF GOOD RECOMMENDATIONS:
      - "Today: Make 10 calls to parents, target 2 new customers, complete 3 demos by 5 PM"
      - "Today: Call 5 parents before lunch, follow up with 2 scheduled demos, send 3 WhatsApp messages"
      - "This week: Target 15 new parent contacts, complete 8 demos, close 3 sales"
      
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
      
      IMPROVEMENT FOCUS: Provide specific daily and weekly targets to increase conversion from current rate to higher rates, improve demo effectiveness, optimize language targeting, enhance follow-up processes.
      
      IMPORTANT: Each recommendation must include SPECIFIC NUMBERS and ACTIONABLE STEPS. Format like: "Today: Make X calls, get Y customers, complete Z demos" or "This week: Target X new contacts, complete Y demos, close Z sales"
      
      Keep each recommendation short (1-2 sentences max) and actionable for education sales team.`;

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
