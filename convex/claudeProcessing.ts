import { action } from "./_generated/server";
import { v } from "convex/values";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Process CV text using Claude AI
 * Extracts candidate information, skills, experience, etc.
 */
export const processCVWithClaude = action({
  args: {
    cvText: v.string(),
    cvId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const systemPrompt = `You are an expert HR recruiter and CV parser. Analyze the provided CV text and extract the following information in JSON format:
{
  "candidateName": "Full name",
  "email": "email address or null",
  "phone": "phone number or null",
  "location": "city, country or null",
  "currentTitle": "current job title",
  "industry": "primary industry",
  "sector": "business sector",
  "seniority": "junior|mid|senior|lead|executive",
  "yearsOfExperience": "number",
  "skills": ["skill1", "skill2", ...],
  "languages": ["language1", "language2", ...],
  "summary": "2-3 sentence summary of the candidate's professional background"
}

Be accurate and extract only information explicitly stated in the CV. For seniority, infer from experience level.`;

      const message = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Please parse this CV:\n\n${args.cvText}`,
          },
        ],
      });

      // Extract the text response
      const responseText =
        message.content[0].type === "text" ? message.content[0].text : "";

      // Parse JSON from response
      let parsedData;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch (parseError) {
        console.error("Failed to parse Claude response:", responseText);
        throw new Error("Failed to parse Claude AI response");
      }

      return {
        success: true,
        data: {
          candidateName: parsedData.candidateName,
          email: parsedData.email,
          phone: parsedData.phone,
          location: parsedData.location,
          currentTitle: parsedData.currentTitle,
          industry: parsedData.industry,
          sector: parsedData.sector,
          seniority: parsedData.seniority,
          yearsOfExperience: parsedData.yearsOfExperience,
          skills: parsedData.skills || [],
          languages: parsedData.languages || [],
          summary: parsedData.summary,
        },
        cvId: args.cvId,
      };
    } catch (error) {
      console.error("Error processing CV with Claude:", error);
      throw new Error(
        `Failed to process CV: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
});

/**
 * Match CV against a Job Description using Claude
 * Returns match score and reasoning
 */
export const matchCVToJob = action({
  args: {
    cvText: v.string(),
    jobDescription: v.string(),
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const message = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Compare this CV against the job description and provide a match analysis.

CV:
${args.cvText}

Job Description:
${args.jobDescription}

Provide your response in JSON format:
{
  "matchScore": 0-100,
  "matchedSkills": ["skill1", "skill2", ...],
  "missingSkills": ["skill1", "skill2", ...],
  "reasoning": "brief explanation of the match"
}`,
          },
        ],
      });

      const responseText =
        message.content[0].type === "text" ? message.content[0].text : "";

      let matchData;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          matchData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch (parseError) {
        console.error("Failed to parse match response:", responseText);
        throw new Error("Failed to parse matching results");
      }

      return {
        success: true,
        jobId: args.jobId,
        matchScore: matchData.matchScore,
        matchedSkills: matchData.matchedSkills || [],
        missingSkills: matchData.missingSkills || [],
        reasoning: matchData.reasoning,
      };
    } catch (error) {
      console.error("Error matching CV to job:", error);
      throw new Error(
        `Failed to match CV: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
});

/**
 * Generate interview questions based on CV
 */
export const generateInterviewQuestions = action({
  args: {
    cvText: v.string(),
    jobDescription: v.string(),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    try {
      const questionCount = args.count || 5;

      const message = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Generate ${questionCount} interview questions for a candidate based on their CV and the job requirements.

CV:
${args.cvText}

Job Description:
${args.jobDescription}

Provide questions in JSON format:
{
  "questions": [
    {
      "question": "question text",
      "category": "experience|skills|motivation|technical",
      "difficulty": "easy|medium|hard"
    }
  ]
}`,
          },
        ],
      });

      const responseText =
        message.content[0].type === "text" ? message.content[0].text : "";

      let questionsData;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          questionsData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch (parseError) {
        console.error("Failed to parse questions response:", responseText);
        throw new Error("Failed to generate interview questions");
      }

      return {
        success: true,
        questions: questionsData.questions || [],
      };
    } catch (error) {
      console.error("Error generating interview questions:", error);
      throw new Error(
        `Failed to generate questions: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
});
