import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Twitter, Calendar, Sheet, Settings, LogOut, Plus, Trash2, Edit, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { format } from 'date-fns';

interface Tweet {
  id: string;
  content: string;
  status: string;
  scheduled_for: string | null;
  created_at: string;
  hashtags: string[] | null;
}

const TweetScheduler = () => {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTweet, setEditingTweet] = useState<Tweet | null>(null);
  
  const [newTweet, setNewTweet] = useState({
    content: '',
    scheduled_for: '',
    hashtags: ''
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchTweets();
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
      if (!data?.twitter_connected) {
        toast({
          title: 'Twitter Not Connected',
          description: 'Please connect your Twitter account first.',
          variant: 'destructive',
        });
      }
    }
  };

  const fetchTweets = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('tweets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tweets:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch tweets.',
        variant: 'destructive',
      });
    } else {
      setTweets(data || []);
    }
  };

  const handleScheduleTweet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile?.twitter_connected) {
      toast({
        title: 'Twitter Not Connected',
        description: 'Please connect your Twitter account first.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const hashtags = newTweet.hashtags
        ? newTweet.hashtags.split(',').map(tag => tag.trim().replace('#', ''))
        : null;

      const { error } = await supabase
        .from('tweets')
        .insert([
          {
            user_id: user.id,
            content: newTweet.content,
            status: newTweet.scheduled_for ? 'scheduled' : 'draft',
            scheduled_for: newTweet.scheduled_for || null,
            hashtags: hashtags
          }
        ]);

      if (error) {
        throw new Error(error.message);
      }

      // If scheduled, add to scheduling queue
      if (newTweet.scheduled_for) {
        const { error: queueError } = await supabase
          .from('scheduling_queue')
          .insert([
            {
              user_id: user.id,
              tweet_id: (await supabase.from('tweets').select('id').eq('user_id', user.id).eq('content', newTweet.content).single()).data?.id,
              scheduled_for: newTweet.scheduled_for
            }
          ]);

        if (queueError) {
          console.error('Error adding to queue:', queueError);
        }
      }

      toast({
        title: 'Tweet Scheduled!',
        description: newTweet.scheduled_for 
          ? `Tweet scheduled for ${format(new Date(newTweet.scheduled_for), 'PPP p')}`
          : 'Tweet saved as draft.',
      });

      setNewTweet({ content: '', scheduled_for: '', hashtags: '' });
      setIsScheduleDialogOpen(false);
      fetchTweets();

    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to schedule tweet.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteTweet = async (tweetId: string) => {
    try {
      const { error } = await supabase
        .from('tweets')
        .delete()
        .eq('id', tweetId)
        .eq('user_id', user?.id);

      if (error) {
        throw new Error(error.message);
      }

      toast({
        title: 'Tweet Deleted',
        description: 'Tweet has been deleted successfully.',
      });

      fetchTweets();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete tweet.',
        variant: 'destructive',
      });
    }
  };

  const handlePostNow = async (tweet: Tweet) => {
    if (!profile?.twitter_connected) {
      toast({
        title: 'Twitter Not Connected',
        description: 'Please connect your Twitter account first.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Call the post tweet edge function
      const { data, error } = await supabase.functions.invoke('post-tweet', {
        body: { tweetId: tweet.id }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to post tweet');
      }

      toast({
        title: 'Tweet Posted!',
        description: 'Your tweet has been posted to Twitter.',
      });

      fetchTweets();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to post tweet.',
        variant: 'destructive',
      });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-green-100 text-green-800">Published</Badge>;
      case 'scheduled':
        return <Badge className="bg-blue-100 text-blue-800">Scheduled</Badge>;
      case 'draft':
        return <Badge variant="outline">Draft</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
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
                <SidebarMenuButton onClick={() => navigate('/scheduler')} className="bg-accent">
                  <Sheet className="h-4 w-4" />
                  Tweet Scheduler
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => navigate('/twitter-connect')}>
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
              <div className="ml-4 flex items-center justify-between w-full">
                <h1 className="text-lg font-semibold">Tweet Scheduler</h1>
                <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Schedule Tweet
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Schedule New Tweet</DialogTitle>
                      <DialogDescription>
                        Create and schedule a new tweet to be posted automatically.
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleScheduleTweet} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="content">Tweet Content</Label>
                        <Textarea
                          id="content"
                          value={newTweet.content}
                          onChange={(e) => setNewTweet(prev => ({ ...prev, content: e.target.value }))}
                          placeholder="What's happening?"
                          maxLength={280}
                          required
                        />
                        <div className="text-xs text-muted-foreground text-right">
                          {newTweet.content.length}/280
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="hashtags">Hashtags (optional)</Label>
                        <Input
                          id="hashtags"
                          value={newTweet.hashtags}
                          onChange={(e) => setNewTweet(prev => ({ ...prev, hashtags: e.target.value }))}
                          placeholder="#example, #hashtag"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="scheduled_for">Schedule For (optional)</Label>
                        <Input
                          id="scheduled_for"
                          type="datetime-local"
                          value={newTweet.scheduled_for}
                          onChange={(e) => setNewTweet(prev => ({ ...prev, scheduled_for: e.target.value }))}
                          min={new Date().toISOString().slice(0, 16)}
                        />
                      </div>

                      <div className="flex space-x-2">
                        <Button type="submit" className="flex-1">
                          {newTweet.scheduled_for ? 'Schedule Tweet' : 'Save as Draft'}
                        </Button>
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => setIsScheduleDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-4 p-8 pt-6">
            <Card>
              <CardHeader>
                <CardTitle>Your Tweets</CardTitle>
                <CardDescription>
                  Manage your scheduled, draft, and published tweets
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tweets.length === 0 ? (
                  <div className="text-center py-8">
                    <Sheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No tweets yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Create your first tweet to get started with scheduling.
                    </p>
                    <Button onClick={() => setIsScheduleDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Schedule Your First Tweet
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Content</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Scheduled For</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tweets.map((tweet) => (
                        <TableRow key={tweet.id}>
                          <TableCell className="max-w-xs">
                            <div className="truncate">{tweet.content}</div>
                            {tweet.hashtags && (
                              <div className="text-xs text-blue-600 mt-1">
                                {tweet.hashtags.map(tag => `#${tag}`).join(' ')}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(tweet.status)}
                          </TableCell>
                          <TableCell>
                            {tweet.scheduled_for 
                              ? format(new Date(tweet.scheduled_for), 'PPP p')
                              : '-'
                            }
                          </TableCell>
                          <TableCell>
                            {format(new Date(tweet.created_at), 'PPP')}
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              {(tweet.status === 'draft' || tweet.status === 'scheduled') && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handlePostNow(tweet)}
                                  disabled={!profile?.twitter_connected}
                                >
                                  <Send className="h-3 w-3" />
                                </Button>
                              )}
                              {tweet.status !== 'published' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDeleteTweet(tweet.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default TweetScheduler;