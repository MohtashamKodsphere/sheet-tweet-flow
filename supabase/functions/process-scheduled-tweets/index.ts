import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from "node:crypto";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_KEY = Deno.env.get("TWITTER_CONSUMER_KEY")?.trim();
const API_SECRET = Deno.env.get("TWITTER_CONSUMER_SECRET")?.trim();

function validateEnvironmentVariables() {
  if (!API_KEY) {
    throw new Error("Missing TWITTER_CONSUMER_KEY environment variable");
  }
  if (!API_SECRET) {
    throw new Error("Missing TWITTER_CONSUMER_SECRET environment variable");
  }
}

function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  const signatureBaseString = `${method}&${encodeURIComponent(
    url
  )}&${encodeURIComponent(
    Object.entries(params)
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join("&")
  )}`;
  const signingKey = `${encodeURIComponent(
    consumerSecret
  )}&${encodeURIComponent(tokenSecret)}`;
  const hmacSha1 = createHmac("sha1", signingKey);
  const signature = hmacSha1.update(signatureBaseString).digest("base64");

  return signature;
}

function generateOAuthHeader(method: string, url: string, accessToken: string, accessTokenSecret: string): string {
  const oauthParams = {
    oauth_consumer_key: API_KEY!,
    oauth_nonce: Math.random().toString(36).substring(2),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  const signature = generateOAuthSignature(
    method,
    url,
    oauthParams,
    API_SECRET!,
    accessTokenSecret
  );

  const signedOAuthParams = {
    ...oauthParams,
    oauth_signature: signature,
  };

  const entries = Object.entries(signedOAuthParams).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  return (
    "OAuth " +
    entries
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
      .join(", ")
  );
}

async function sendTweet(tweetText: string, accessToken: string, accessTokenSecret: string): Promise<any> {
  const url = "https://api.x.com/2/tweets";
  const method = "POST";
  const params = { text: tweetText };

  const oauthHeader = generateOAuthHeader(method, url, accessToken, accessTokenSecret);

  const response = await fetch(url, {
    method: method,
    headers: {
      Authorization: oauthHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `HTTP error! status: ${response.status}, body: ${responseText}`
    );
  }

  return JSON.parse(responseText);
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    validateEnvironmentVariables();

    // Create Supabase client with service role key for admin access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Processing scheduled tweets...');

    // Get all scheduled tweets that are ready to be posted
    const now = new Date().toISOString();
    const { data: scheduledQueue, error: queueError } = await supabase
      .from('scheduling_queue')
      .select(`
        *,
        tweets (*)
      `)
      .eq('processed', false)
      .lte('scheduled_for', now);

    if (queueError) {
      throw new Error(`Error fetching scheduled tweets: ${queueError.message}`);
    }

    console.log(`Found ${scheduledQueue?.length || 0} tweets to process`);

    let processedCount = 0;
    let errorCount = 0;

    for (const queueItem of scheduledQueue || []) {
      try {
        console.log(`Processing tweet ${queueItem.tweet_id}`);

        // Get user's Twitter tokens
        const { data: tokens, error: tokensError } = await supabase
          .from('twitter_tokens')
          .select('*')
          .eq('user_id', queueItem.user_id)
          .single();

        if (tokensError || !tokens) {
          throw new Error(`Twitter tokens not found for user ${queueItem.user_id}`);
        }

        const tweet = queueItem.tweets;
        if (!tweet) {
          throw new Error(`Tweet not found for queue item ${queueItem.id}`);
        }

        // Format tweet content with hashtags
        let tweetContent = tweet.content;
        if (tweet.hashtags && tweet.hashtags.length > 0) {
          const hashtagString = tweet.hashtags.map((tag: string) => `#${tag}`).join(' ');
          tweetContent = `${tweet.content} ${hashtagString}`;
        }

        // Post the tweet
        const tweetResult = await sendTweet(tweetContent, tokens.access_token, tokens.access_token_secret);

        // Update tweet status
        await supabase
          .from('tweets')
          .update({
            status: 'published',
            posted_at: new Date().toISOString(),
            twitter_id: tweetResult.data?.id
          })
          .eq('id', queueItem.tweet_id);

        // Mark queue item as processed
        await supabase
          .from('scheduling_queue')
          .update({
            processed: true,
            processed_at: new Date().toISOString()
          })
          .eq('id', queueItem.id);

        processedCount++;
        console.log(`Successfully posted tweet ${queueItem.tweet_id}`);

      } catch (error: any) {
        console.error(`Error processing tweet ${queueItem.tweet_id}:`, error);
        errorCount++;

        // Mark queue item as processed with error
        await supabase
          .from('scheduling_queue')
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            error_message: error.message
          })
          .eq('id', queueItem.id);

        // Update tweet status to failed
        await supabase
          .from('tweets')
          .update({ status: 'failed' })
          .eq('id', queueItem.tweet_id);
      }
    }

    const summary = {
      total: scheduledQueue?.length || 0,
      processed: processedCount,
      errors: errorCount,
      timestamp: new Date().toISOString()
    };

    console.log('Processing complete:', summary);

    return new Response(
      JSON.stringify({ 
        success: true, 
        summary 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    console.error("Process scheduled tweets error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});