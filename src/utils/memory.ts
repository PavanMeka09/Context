import { generateTextCompletion } from './api';
import { Storage } from './storage';
import type { Settings, MemoryItem } from './storage';

export async function extractAndSaveMemories(
  settings: Settings,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  if (!settings.isMemoryEnabled) return;
  if (!settings.apiKey && settings.provider !== 'ollama') return;

  const currentMemories = Storage.getMemories();

  const prompt = `You are the Memory Extraction Engine for a local AI workspace called "Context".
Your job is to analyze the recent conversation turn and extract key facts that should be stored in the user's long-term memory.

Memories are classified into 4 categories:
1. 'preference': User preferences (e.g. coding style, explanations, tone, likes TypeScript over JS, prefers dark mode).
2. 'project': Information about user's projects (e.g. project names, tech stack, requirements, files, folders, what they are building).
3. 'conversation': High-level summaries or key decisions from previous chats (e.g. debugged empty responses in OpenRouter, set up docker-compose for SearXNG).
4. 'other': Any other durable general facts about the user.

Below is the list of current memories:
${JSON.stringify(
  currentMemories.map(m => ({ id: m.id, content: m.content, category: m.category })),
  null,
  2
)}

Here is the recent conversation turn:
User: "${userMessage}"
Assistant: "${assistantResponse}"

Tasks:
1. Identify if the turn contains any new memories, updates to existing memories, or details that conflict with current memories.
2. If an existing memory is outdated, replaced, or corrected, specify its ID in the "deleted_memory_ids" list.
3. Do NOT store trivial facts, temporary states, code snippets, or general pleasantries. Only store durable, high-impact facts.
4. Make memory text concise, clear, and written in third-person (e.g. "User prefers TypeScript over JavaScript", "Is developing a chatbot called Context").

Respond ONLY with a JSON object in the following format:
{
  "new_memories": [
    { "content": "Fact description...", "category": "preference" | "project" | "conversation" | "other" }
  ],
  "deleted_memory_ids": ["id-to-delete-1"]
}

Return ONLY raw JSON. Do not include markdown code block wrappers (like \`\`\`json). No explanations, no text before or after the JSON.`;

  try {
    const rawResult = await generateTextCompletion(
      settings,
      [{ id: `temp-${Date.now()}`, role: 'user', content: prompt, timestamp: new Date().toISOString() }],
      'You are a precise JSON generator. Output raw JSON only.'
    );
    if (!rawResult) return;

    // Robustly extract JSON object using regex matching between `{` and `}` per spec
    let jsonCandidate = rawResult.trim();
    const markdownFenceMatch = rawResult.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (markdownFenceMatch) {
      jsonCandidate = markdownFenceMatch[1].trim();
    }
    const jsonObjectMatch = jsonCandidate.match(/\{[\s\S]*\}/);
    if (!jsonObjectMatch) return;

    let parsed: { new_memories?: Array<{ content?: string; category?: string }>; deleted_memory_ids?: string[] } | null = null;
    try {
      parsed = JSON.parse(jsonObjectMatch[0]);
    } catch {
      return;
    }
    if (!parsed) return;

    let updatedMemories: MemoryItem[] = [...currentMemories];

    // Remove deleted memories
    const deletedIds = parsed.deleted_memory_ids;
    if (Array.isArray(deletedIds) && deletedIds.length > 0) {
      updatedMemories = updatedMemories.filter(m => !deletedIds.includes(m.id));
    }

    // Add new memories
    if (Array.isArray(parsed.new_memories)) {
      for (const newMem of parsed.new_memories) {
        if (newMem && typeof newMem.content === 'string' && newMem.content.trim()) {
          const content = newMem.content.trim();
          const category = newMem.category && ['preference', 'project', 'conversation', 'other'].includes(newMem.category)
            ? newMem.category
            : 'other';

          // Prevent exact duplicate content additions
          const exists = updatedMemories.some(
            m => m.content.toLowerCase().trim() === content.toLowerCase()
          );

          if (!exists) {
            updatedMemories.push({
              id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              content,
              category: category as MemoryItem['category'],
              createdAt: new Date().toISOString()
            });
          }
        }
      }
    }

    // Save if changed
    if (
      (parsed.deleted_memory_ids && parsed.deleted_memory_ids.length > 0) ||
      (parsed.new_memories && parsed.new_memories.length > 0)
    ) {
      Storage.saveMemories(updatedMemories);
    }
  } catch (err) {
    console.error('Failed to extract and save memories:', err);
  }
}
