-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  twitter_username TEXT,
  twitter_connected BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tweets table for content management
CREATE TABLE public.tweets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  hashtags TEXT[],
  scheduled_for TIMESTAMP WITH TIME ZONE,
  posted_at TIMESTAMP WITH TIME ZONE,
  twitter_id TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'posted', 'failed')),
  engagement_stats JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create scheduling_queue table for automated posting
CREATE TABLE public.scheduling_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tweet_id UUID NOT NULL REFERENCES public.tweets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create twitter_tokens table for OAuth tokens
CREATE TABLE public.twitter_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  access_token_secret TEXT NOT NULL,
  twitter_user_id TEXT,
  twitter_username TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tweets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twitter_tokens ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create RLS policies for tweets
CREATE POLICY "Users can view their own tweets" 
ON public.tweets FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tweets" 
ON public.tweets FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tweets" 
ON public.tweets FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tweets" 
ON public.tweets FOR DELETE 
USING (auth.uid() = user_id);

-- Create RLS policies for scheduling_queue
CREATE POLICY "Users can view their own scheduled tweets" 
ON public.scheduling_queue FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own scheduled tweets" 
ON public.scheduling_queue FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled tweets" 
ON public.scheduling_queue FOR UPDATE 
USING (auth.uid() = user_id);

-- Create RLS policies for twitter_tokens
CREATE POLICY "Users can view their own tokens" 
ON public.twitter_tokens FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tokens" 
ON public.twitter_tokens FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tokens" 
ON public.twitter_tokens FOR UPDATE 
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tweets_updated_at
BEFORE UPDATE ON public.tweets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_twitter_tokens_updated_at
BEFORE UPDATE ON public.twitter_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY definer
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END;
$$;

-- Create trigger for new user registration
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create indexes for better performance
CREATE INDEX idx_tweets_user_id ON public.tweets(user_id);
CREATE INDEX idx_tweets_status ON public.tweets(status);
CREATE INDEX idx_tweets_scheduled_for ON public.tweets(scheduled_for);
CREATE INDEX idx_scheduling_queue_scheduled_for ON public.scheduling_queue(scheduled_for);
CREATE INDEX idx_scheduling_queue_processed ON public.scheduling_queue(processed);