// Client-side Gemini Proxy Client
// This proxies all AI/Gemini requests to the Express server to prevent API key exposure and CORS issues.

export const generateTextViaProxy = async (prompt: string, systemInstruction?: string): Promise<string> => {
  try {
    const response = await fetch('/api/gemini/generate-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, systemInstruction })
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${response.status}`);
    }
    const data = await response.json();
    return data.text || '';
  } catch (error) {
    console.error("generateTextViaProxy Error:", error);
    throw error;
  }
};

export const scanImageViaProxy = async (base64Image: string, prompt?: string): Promise<string> => {
  try {
    const response = await fetch('/api/gemini/scan-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image, prompt })
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${response.status}`);
    }
    const data = await response.json();
    return data.text || '';
  } catch (error) {
    console.error("scanImageViaProxy Error:", error);
    throw error;
  }
};

export const detectColumnsViaProxy = async (sampleData: any[]): Promise<string> => {
  try {
    const response = await fetch('/api/gemini/detect-columns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sampleData })
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${response.status}`);
    }
    const data = await response.json();
    return data.text || '';
  } catch (error) {
    console.error("detectColumnsViaProxy Error:", error);
    throw error;
  }
};

export const processVoiceTranscriptViaProxy = async (transcript: string, systemInstruction: string): Promise<string> => {
  try {
    const response = await fetch('/api/gemini/voice-transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, systemInstruction })
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${response.status}`);
    }
    const data = await response.json();
    return data.text || '';
  } catch (error) {
    console.error("processVoiceTranscriptViaProxy Error:", error);
    throw error;
  }
};

export const extractJson = (text: string) => {
  if (!text || typeof text !== 'string') return null;
  try {
    // Strip markdown code fences if present
    let cleanText = text.replace(/```(?:json)?\n?/gi, '').replace(/```\n?/g, '').trim();
    
    // First try direct parse
    try {
      return JSON.parse(cleanText);
    } catch {
      // Find JSON object or array substring
      const match = cleanText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (match) {
        // Remove trailing commas before closing braces/brackets
        const sanitized = match[0].replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(sanitized);
      }
    }
    return null;
  } catch (e) {
    console.warn("JSON Parse Warning:", e, "Text:", text?.substring(0, 200));
    return null;
  }
};
