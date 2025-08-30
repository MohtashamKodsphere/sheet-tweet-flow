import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { Twitter, Calendar, Sheet, Settings, LogOut, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Dashboard = () => {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({
    totalTweets: 0,
    scheduledTweets: 0,
    publishedTweets: 0
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchStats();
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
    }
  };

  const fetchStats = async () => {
    if (!user) return;

    const { data: tweets, error } = await supabase
      .from('tweets')
      .select('status')
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching stats:', error);
      return;
    }

    const stats = {
      totalTweets: tweets?.length || 0,
      scheduledTweets: tweets?.filter(t => t.status === 'scheduled').length || 0,
      publishedTweets: tweets?.filter(t => t.status === 'published').length || 0
    };

    setStats(stats);
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
              <div className="ml-auto flex items-center space-x-4">
                <span className="text-sm font-medium">
                  Welcome, {profile?.display_name || user.email}
                </span>
                {profile?.twitter_connected ? (
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    Twitter Connected
                  </Badge>
                ) : (
                  <Badge variant="outline">Twitter Not Connected</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
              <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
              <div className="flex items-center space-x-2">
                <Button onClick={() => navigate('/scheduler')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Schedule Tweet
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Tweets</CardTitle>
                  <Sheet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalTweets}</div>
                  <p className="text-xs text-muted-foreground">All time</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.scheduledTweets}</div>
                  <p className="text-xs text-muted-foreground">Waiting to be posted</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Published</CardTitle>
                  <Twitter className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.publishedTweets}</div>
                  <p className="text-xs text-muted-foreground">Successfully posted</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
              <Card className="col-span-4">
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                  <CardDescription>Get started with your Twitter automation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!profile?.twitter_connected && (
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h4 className="font-medium">Connect your Twitter account</h4>
                        <p className="text-sm text-muted-foreground">
                          Connect your Twitter account to start scheduling tweets
                        </p>
                      </div>
                      <Button onClick={() => navigate('/twitter-connect')}>
                        Connect
                      </Button>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Schedule your first tweet</h4>
                      <p className="text-sm text-muted-foreground">
                        Use our scheduler to plan your content in advance
                      </p>
                    </div>
                    <Button 
                      onClick={() => navigate('/scheduler')}
                      disabled={!profile?.twitter_connected}
                    >
                      Schedule
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="col-span-3">
                <CardHeader>
                  <CardTitle>Account Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <div className={`h-2 w-2 rounded-full ${profile?.twitter_connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-sm">
                      Twitter {profile?.twitter_connected ? 'Connected' : 'Not Connected'}
                    </span>
                  </div>
                  {profile?.twitter_username && (
                    <div className="text-sm text-muted-foreground">
                      @{profile.twitter_username}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;