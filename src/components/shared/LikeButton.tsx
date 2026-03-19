import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toggleFavorite } from "@/lib/favorites-service";
import { toast } from "sonner";

interface LikeButtonProps {
  entityId: string;
  entityType: "definition" | "ontology";
  isLiked: boolean;
  likeCount?: number;
  onToggle?: (liked: boolean) => void;
  size?: "sm" | "default";
}

export function LikeButton({ entityId, entityType, isLiked, likeCount, onToggle, size = "sm" }: LikeButtonProps) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(isLiked);
  const [count, setCount] = useState(likeCount ?? 0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLiked(isLiked);
  }, [isLiked]);

  useEffect(() => {
    setCount(likeCount ?? 0);
  }, [likeCount]);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || loading) return;
    setLoading(true);
    const nextLiked = !liked;
    const { error } = await toggleFavorite(supabase, {
      userId: user.id,
      entityId,
      entityType,
      liked: nextLiked,
    });

    if (error) {
      toast.error(error.message);
    } else {
      setLiked(nextLiked);
      setCount(c => Math.max(0, c + (nextLiked ? 1 : -1)));
      onToggle?.(nextLiked);
    }

    setLoading(false);
  };

  return (
    <Button
      variant="ghost"
      size={size === "sm" ? "sm" : "default"}
      onClick={toggle}
      className={cn(
        "gap-1.5 text-muted-foreground hover:text-destructive transition-colors",
        liked && "text-destructive"
      )}
      disabled={loading}
    >
      <Heart className={cn("h-4 w-4", liked && "fill-current")} />
      {count > 0 && <span className="text-xs">{count}</span>}
    </Button>
  );
}
