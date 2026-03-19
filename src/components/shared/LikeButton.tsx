import { useState } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

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

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || loading) return;
    setLoading(true);
    if (liked) {
      const col = entityType === "definition" ? "definition_id" : "ontology_id";
      await supabase.from("favorites").delete().eq("user_id", user.id).eq(col, entityId);
      setLiked(false);
      setCount(c => Math.max(0, c - 1));
      onToggle?.(false);
    } else {
      const insert: any = { user_id: user.id };
      if (entityType === "definition") insert.definition_id = entityId;
      else insert.ontology_id = entityId;
      await supabase.from("favorites").insert(insert);
      setLiked(true);
      setCount(c => c + 1);
      onToggle?.(true);
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
