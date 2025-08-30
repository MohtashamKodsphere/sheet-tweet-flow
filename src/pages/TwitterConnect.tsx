import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Twitter, Calendar, Sheet, Settings, LogOut, AlertCircle, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

const TwitterConnect = () => {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [twitterTokens, setTwitterTokens] = useState({
    access_token: '',
    access_token_secret: '',
    twitter_username: ''
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'not_connected' | 'connected' | 'error'>('not_connected');
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchProfile();
      checkTwitterConnection();
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
    } else {
      setProfile(data);
      if (data?.twitter_connected) {
        setConnectionStatus('connected');
      }
    }
  };

  const checkTwitterConnection = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('twitter_tokens')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data && !error) {
      setConnectionStatus('connected');
      setTwitterTokens({
        access_token: '***hidden***',
        access_token_secret: '***hidden***',
        twitter_username: data.twitter_username || ''
      });
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsConnecting(true);

    try {
      // First test the connection by calling our test edge function
      const { data: testResult, error: testError } = await supabase.functions.invoke('test-twitter-connection', {
        body: {
          access_token: twitterTokens.access_token,
          access_token_secret: twitterTokens.access_token_secret
        }
      });

      if (testError) {
        throw new Error('Failed to test Twitter connection');
      }

      if (!testResult.success) {
        throw new Error(testResult.error || 'Twitter connection test failed');
      }

      // If test passes, save the tokens
      const { error: insertError } = await supabase
        .from('twitter_tokens')
        .upsert([
          {
            user_id: user.id,
            access_token: twitterTokens.access_token,
            access_token_secret: twitterTokens.access_token_secret,
            twitter_username: testResult.username || twitterTokens.twitter_username,
            twitter_user_id: testResult.user_id
          }
        ]);

      if (insertError) {
        throw new Error('Failed to save Twitter tokens');
      }

      // Update profile
      await supabase
        .from('profiles')
        .update({
          twitter_connected: true,
          twitter_username: testResult.username || twitterTokens.twitter_username
        })
        .eq('user_id', user.id);

      setConnectionStatus('connected');
      toast({
        title: 'Twitter Connected!',
        description: 'Your Twitter account has been successfully connected.',
      });

      // Hide sensitive tokens
      setTwitterTokens(prev => ({
        ...prev,
        access_token: '***hidden***',
        access_token_secret: '***hidden***',
        twitter_username: testResult.username || prev.twitter_username
      }));

    } catch (error: any) {
      console.error('Twitter connection error:', error);
      setConnectionStatus('error');
      toast({
        title: 'Connection Failed',
        description: error.message || 'Failed to connect to Twitter. Please check your tokens.',
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!user) return;

    try {
      await supabase
        .from('twitter_tokens')
        .delete()
        .eq('user_id', user.id);

      await supabase
        .from('profiles')
        .update({
          twitter_connected: false,
          twitter_username: null
        })
        .eq('user_id', user.id);

      setConnectionStatus('not_connected');
      setTwitterTokens({
        access_token: '',
        access_token_secret: '',
        twitter_username: ''
      });

      toast({
        title: 'Twitter Disconnected',
        description: 'Your Twitter account has been disconnected.',
      });

    } catch (error: any) {
      toast({
        title: 'Disconnection Failed',
        description: error.message || 'Failed to disconnect Twitter account.',
        variant: 'destructive',
      });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-2 px-4 py-2">
              <div className="bg-primary text-primary-foreground rounded-full p-2">
                <Twitter className="h-4 w-4" />
              </div>
              <span className="font-semibold">Tweet Scheduler</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => navigate('/dashboard')}>
                  <Calendar className="h-4 w-4" />
                  Dashboard
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => navigate('/scheduler')}>
                  <Sheet className="h-4 w-4" />
                  Tweet Scheduler
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => navigate('/twitter-connect')} className="bg-accent">
                  <Twitter className="h-4 w-4" />
                  Connect Twitter
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => navigate('/settings')}>
                  <Settings className="h-4 w-4" />
                  Settings
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>

        <main className="flex-1">
          <div className="border-b bg-background">
            <div className="flex h-16 items-center px-4">
              <SidebarTrigger />
              <h1 className="ml-4 text-lg font-semibold">Connect Twitter Account</h1>
            </div>
          </div>

          <div className="flex-1 space-y-4 p-8 pt-6">
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Twitter className="h-5 w-5" />
                  Twitter Integration
                </CardTitle>
                <CardDescription>
                  Connect your Twitter account to start scheduling and posting tweets automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {connectionStatus === 'connected' ? (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      Twitter account connected successfully! 
                      {twitterTokens.twitter_username && ` (@${twitterTokens.twitter_username})`}
                    </AlertDescription>
                  </Alert>
                ) : connectionStatus === 'error' ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Failed to connect to Twitter. Please check your API tokens and try again.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      You need to connect your Twitter account to schedule tweets.
                    </AlertDescription>
                  </Alert>
                )}

                {connectionStatus !== 'connected' && (
                  <div className="space-y-4">
                    <div className="bg-muted p-4 rounded-lg">
                      <h4 className="font-medium mb-2">How to get your Twitter API tokens:</h4>
                      <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
                        <li>Go to <a href="https://developer.twitter.com/en/portal/dashboard" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Twitter Developer Portal</a></li>
                        <li>Create a new app or use an existing one</li>
                        <li>Make sure your app has "Read and Write" permissions</li>
                        <li>Generate your Access Token and Secret under "Keys and tokens"</li>
                        <li>Copy the Access Token and Access Token Secret below</li>
                      </ol>
                    </div>

                    <form onSubmit={handleConnect} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="access_token">Access Token</Label>
                        <Input
                          id="access_token"
                          type="password"
                          value={twitterTokens.access_token}
                          onChange={(e) => setTwitterTokens(prev => ({ ...prev, access_token: e.target.value }))}
                          placeholder="Enter your Twitter Access Token"
                          required
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="access_token_secret">Access Token Secret</Label>
                        <Input
                          id="access_token_secret"
                          type="password"
                          value={twitterTokens.access_token_secret}
                          onChange={(e) => setTwitterTokens(prev => ({ ...prev, access_token_secret: e.target.value }))}
                          placeholder="Enter your Twitter Access Token Secret"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="twitter_username">Twitter Username (optional)</Label>
                        <Input
                          id="twitter_username"
                          type="text"
                          value={twitterTokens.twitter_username}
                          onChange={(e) => setTwitterTokens(prev => ({ ...prev, twitter_username: e.target.value }))}
                          placeholder="Enter your Twitter username (without @)"
                        />
                      </div>

                      <Button type="submit" disabled={isConnecting} className="w-full">
                        {isConnecting ? 'Connecting...' : 'Connect Twitter Account'}
                      </Button>
                    </form>
                  </div>
                )}

                {connectionStatus === 'connected' && (
                  <div className="flex justify-between items-center pt-4 border-t">
                    <div>
                      <p className="font-medium">Account Connected</p>
                      <p className="text-sm text-muted-foreground">
                        Ready to schedule tweets
                      </p>
                    </div>
                    <div className="space-x-2">
                      <Button variant="outline" onClick={handleDisconnect}>
                        Disconnect
                      </Button>
                      <Button onClick={() => navigate('/scheduler')}>
                        Schedule Tweets
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default TwitterConnect;