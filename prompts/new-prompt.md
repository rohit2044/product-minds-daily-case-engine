# PROMPT TEMPLATE: PM Interview Case Study Generator

Use this prompt to generate concise, interview-ready case studies for any PM question type.

---

## THE PROMPT

```
You are creating a PM interview case study in a daily post format (2-3 minute read, ~600-700 words max).

QUESTION TYPE: [Insert: Root Cause Analysis / Product Design / Prioritization / Metrics / Strategy / etc.]

CASE STUDY: [Insert the famous decision/scenario, e.g., "Airbnb's Professional Photography Decision"]

FORMAT REQUIREMENTS:

1. **Header Section**
   - Title with the company and decision
   - Question type, difficulty level (⭐⭐⭐⭐), read time
   - The actual interview question in quotes

2. **What Really Happened** (3-4 sentences)
   - The real story: what the company did
   - The problem they faced
   - The solution they chose
   - The result/impact
   - The lesson learned

3. **Your Approach (The Mental Model)** 
   - Start with: "Before diving in, here's how to think about [QUESTION TYPE] problems:"
   - Show a visual flow with arrows (→) of the thinking process
   - List "What you're doing:" with 7 natural steps (not "Step 1, Step 2" but action verbs)
   - End with: "This isn't a rigid script—it's how strong PMs naturally think through problems. Now let's see it in action."
   
   Example mental model structure:
   ```
Understand → Define → Decompose → Diagnose → Theorize → Validate → Solve
   ```

4. **How to Answer This Question**
   For each of the 7 parts:
   - Number it (1, 2, 3...) with an action verb title and time estimate
   - Include "What you say:" with actual dialogue
   - Show questions to ask (for clarification steps)
   - Show your internal thinking with → arrows
   - Keep each part 2-4 paragraphs MAX
   - Include realistic interview back-and-forth

5. **Handling Pushback** (2-3 common objections)
   - Format: "If they say: [objection]"
   - "You say: [response]"

6. **Summary**
   - "Your approach:" with the 7 parts listed
   - "Key insight:" one sentence takeaway

7. **What Interviewers Evaluate** (6-8 bullets with ✅)

8. **Common Mistakes** (5-6 bullets with ❌)

9. **Practice Question**
   - One similar question to try
   - Brief guidance on applying the same approach

TONE & STYLE:
- Conversational but professional
- Use → arrows for transitions in thinking
- Use emojis sparingly (just ✅ ❌ ⭐ ⚠️)
- Bold key concepts
- Keep paragraphs SHORT (2-3 sentences max)
- No fluff—every sentence must add value
- Avoid saying "framework" or "script"—use "approach" or "mental model"

CONSTRAINTS:
- Total word count: 600-700 words
- Read time: 2-3 minutes
- Each main section should have timing in parentheses
- Include specific dialogue examples ("What you say:")
- Make it immediately actionable

Now create the case study for:

**QUESTION TYPE:** [Fill in]
**CASE STUDY:** [Fill in]
**THE QUESTION:** "[Fill in the exact interview question]"
```

---

## EXAMPLE USAGE

To generate a new case study, fill in these fields:

**QUESTION TYPE:** Product Launch Decision

**CASE STUDY:** Spotify's Discover Weekly Launch

**THE QUESTION:** "You're a PM at Spotify in 2015. Your team built Discover Weekly—a personalized playlist updated every Monday. Should you launch it? How do you decide?"

Then paste the full prompt with your filled-in details into the LLM.

---

## CUSTOMIZATION TIPS

**For different question types, adjust the mental model:**

- **Root Cause Analysis:** Clarify → Scope → Decompose → Diagnose → Theorize → Validate → Solve
- **Product Design:** Clarify → Users → Problems → Solutions → Prioritize → Validate → Recommend
- **Prioritization:** Understand → Define Success → Generate Options → Evaluate → Trade-offs → Decide → Communicate
- **Metrics:** Clarify → Define Goals → Identify Metrics → Diagnose → Hypothesize → Validate → Fix
- **Strategy:** Situation → Vision → Options → Evaluate → Trade-offs → Decide → Communicate
- **Estimation:** Clarify → Structure → Assumptions → Calculate → Sanity Check → Communicate
- **Execution:** Understand → Stakeholders → Plan → Risks → Mitigate → Execute → Measure

**Adjust the 7 parts based on question type** but always keep it at 7 parts for consistency and memorability.

---

## QUALITY CHECKLIST

Before finalizing, verify:

- ✅ Word count is 600-700 words
- ✅ Read time is 2-3 minutes
- ✅ Mental model section appears BEFORE the detailed answer
- ✅ Each part has realistic dialogue ("What you say:")
- ✅ Includes handling pushback section
- ✅ Has a practice question at the end
- ✅ Avoids words like "framework" or "rigid steps"
- ✅ Uses natural action verbs (Clarify, Diagnose, Validate)
- ✅ Every sentence is essential—no filler

---

## TEMPLATE STRUCTURE SUMMARY

```
# [QUESTION TYPE]: [Company] [Brief Decision Name]

**Header info**

## THE QUESTION
"[Exact question]"

## WHAT REALLY HAPPENED
[3-4 sentence story with problem → solution → result → lesson]

## YOUR APPROACH (The Mental Model)
Flow diagram with arrows
List of 7 natural thinking steps
"This isn't a rigid script..." disclaimer

## HOW TO ANSWER THIS QUESTION

### 1. [ACTION VERB] (X min)
"What you say:"
Q&A or dialogue
Your thinking

### 2-7. [Continue pattern]

## HANDLING PUSHBACK
If they say / You say format

## SUMMARY
Your approach list
Key insight

## WHAT INTERVIEWERS EVALUATE
✅ Bullets

## COMMON MISTAKES
❌ Bullets

## PRACTICE
Similar question
Brief guidance
```