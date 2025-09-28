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
            const basePrompt = `You are an education sales coach specializing in selling to PARENTS and STUDENTS (grades 4-12). Analyze the sales team data and provide exactly 6-7 focused, actionable recommendations for EDUCATION SALES TEAM IMPROVEMENT in JSON format. Return ONLY a valid JSON object with this structure:
      {
        "currentWeek": [
          "Parent conversation tip 1",
          "Student engagement strategy 2", 
          "Education objection handling 3",
          "Academic progress discussion 4",
          "Parent concern addressing 5",
          "Student motivation technique 6"
        ],
        "nextWeek": [
          "Parent conversion target 1",
          "Student engagement goal 2",
          "Academic improvement focus 3", 
          "Parent satisfaction metric 4",
          "Student success story 5",
          "Education sales challenge 6"
        ]
      }
      
      Focus ONLY on: parent conversations, student engagement, academic progress discussions, education objections, parent concerns, student motivation, grade-specific selling. 
      
      IMPORTANT: Include actual conversation scripts and phrases to use with parents. Format like: "Ask parents: 'What subjects is your child struggling with?'" or "Say to parents: 'How are your child's current grades?'"
      
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
          
          Focus on: parent conversation techniques, student academic needs, education objections, parent concerns about grades, student motivation, academic progress discussions.`;

                case 'compare':
                    return `${basePrompt}
          
          EDUCATION SALES TEAM COMPARISON DATA:
          - Sowmya's Parent Conversion: ${JSON.stringify(data.sowmya || {})}
          - Sukaina's Parent Conversion: ${JSON.stringify(data.sukaina || {})}
          
          Focus on: individual parent conversation skills, student engagement techniques, academic progress discussions, parent concern handling, education sales best practices, team collaboration on parent objections.`;

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
          
          Focus on: WhatsApp parent conversations, education demo presentations, language-specific parent communication, student academic needs assessment, parent follow-up timing, education enrollment conversion.`;

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
