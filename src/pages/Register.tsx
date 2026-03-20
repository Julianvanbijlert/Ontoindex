import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Network, Loader2, Eye, Edit2, Shield } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/authorization";

const roles: Array<{ value: AppRole; label: string; description: string; icon: typeof Eye }> = [
  { value: "viewer", label: "Viewer", description: "Browse, search, and comment on ontologies and definitions", icon: Eye },
  { value: "editor", label: "Editor", description: "Create and edit definitions, manage ontologies, submit for review", icon: Edit2 },
  { value: "admin", label: "Admin", description: "Full access including user management and role assignment", icon: Shield },
];

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedRole, setSelectedRole] = useState<AppRole>("viewer");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || !displayName.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName, requested_role: selectedRole },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Account created! Check your email to confirm.");
      navigate("/search");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg animate-fade-in">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Network className="w-5 h-5 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">OntologyHub</h1>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Create account</CardTitle>
            <CardDescription>Get started with OntologyHub</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">Display name</Label>
                <Input id="name" placeholder="Your name" value={displayName} onChange={e => setDisplayName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <Label>Account type</Label>
                <div className="grid grid-cols-3 gap-2">
                  {roles.map(r => (
                    <button
                      type="button"
                      key={r.value}
                      onClick={() => setSelectedRole(r.value)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-all",
                        selectedRole === r.value
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:border-border/80 hover:bg-muted/50"
                      )}
                    >
                      <r.icon className={cn("h-5 w-5", selectedRole === r.value ? "text-primary" : "text-muted-foreground")} />
                      <span className={cn("text-xs font-medium", selectedRole === r.value ? "text-primary" : "text-foreground")}>{r.label}</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">{r.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create account
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:underline font-medium">Sign in</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
