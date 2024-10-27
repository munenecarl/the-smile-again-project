import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Types for responses
interface Response {
  content: string;
  type: 'joke' | 'quote';
  author?: string;
}

// Configuration
const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY') || '';
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const ZENQUOTES_API_URL = 'https://zenquotes.io/api/random';
const TIMEOUT_MS = 10000; // 10 seconds timeout

// Keywords for quotes
const KEYWORDS = ['Anxiety', 'Fear', 'Freedom', 'Life', 'Living', 'Love', 'Pain', 'Past', 'Time', 'Today'];

// Timeout promise
const timeout = (ms: number): Promise<never> => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Timeout')), ms);
  });
}

// The prompt for joke generation
const JOKE_PROMPT = `You are Dave Chappelle,the world famous comedian, trying to cheer up your friend who just went through a breakup. 
Generate a single lighthearted joke about relationships, dating, or heartbreak that might make them laugh. 
The joke should be original, not commonly known, and avoid being mean-spirited.
Return ONLY the joke text with no additional formatting, warnings, or explanation.
Example tone: "They say there are plenty of fish in the sea, so I'm gonna go back to holding my rod until I catch something else."`;

// Function to get a random keyword
function getRandomKeyword(): string {
  const randomIndex = Math.floor(Math.random() * KEYWORDS.length);
  return KEYWORDS[randomIndex];
}

// Function to determine if we should send a joke or quote
function shouldSendJoke(): boolean {
  return Math.random() < 0.5;
}

// Function to fetch a quote from ZenQuotes
async function getQuote(): Promise<Response> {
  try {
    const keyword = getRandomKeyword();
    const response = await Promise.race([
      fetch(`${ZENQUOTES_API_URL}/${keyword}`),
      timeout(TIMEOUT_MS)
    ]);

    if (!response.ok) {
      throw new Error(`ZenQuotes API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data[0].q,
      type: 'quote',
      author: data[0].a
    };
  } catch (error) {
    console.error('Error fetching quote:', error);
    return {
      content: "Sometimes the best quote is the one that remains unspoken.",
      type: 'quote',
      author: "Error Handler"
    };
  }
}

// Function to generate a joke
async function getJoke(): Promise<Response> {
  try {
    const response = await Promise.race([
      fetch(MISTRAL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        },
        body: JSON.stringify({
          model: "mistral-medium",
          messages: [
            {
              role: "user",
              content: JOKE_PROMPT
            }
          ],
          temperature: 0.7,
        }),
      }),
      timeout(TIMEOUT_MS)
    ]);

    if (!response.ok) {
      throw new Error(`Mistral API error: ${response.statusText}`);
    }

    const data = await response.json();
    const jokeContent = data.choices[0].message.content.trim();
    
    return {
      content: jokeContent,
      type: 'joke'
    };

  } catch (error) {
    console.error('Error generating joke:', error);
    
    if (error.message === 'Timeout') {
      return {
        content: "The AI service took long to respond. Maybe it's thinking really hard about being funny!",
        type: 'joke'
      };
    }
    
    return {
      content: "Sorry, I couldn't generate a joke right now. My comedy circuit is having a bad day!",
      type: 'joke'
    };
  }
}

// Main function to get either a joke or quote
async function getContent(): Promise<Response> {
  return shouldSendJoke() ? await getJoke() : await getQuote();
}

// The main serve function for the edge function
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const content = await getContent();
    
    return new Response(JSON.stringify(content), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
});
