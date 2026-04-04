import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  DefinitionAuthoringConfig,
  DefinitionStandardsMetadataDraft,
} from "@/lib/standards/authoring";

interface DefinitionStandardsFieldsProps {
  config: DefinitionAuthoringConfig;
  value: DefinitionStandardsMetadataDraft;
  onChange: <Key extends keyof DefinitionStandardsMetadataDraft>(
    key: Key,
    nextValue: DefinitionStandardsMetadataDraft[Key],
  ) => void;
}

export function DefinitionStandardsFields({
  config,
  value,
  onChange,
}: DefinitionStandardsFieldsProps) {
  if (config.sections.length === 0) {
    return null;
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Active standards shape this definition form</CardTitle>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            The current admin-selected standards expose the fields below so authors can stay closer to compliant structure while still allowing custom or incomplete drafts when rules are non-blocking.
          </p>
          <div className="flex flex-wrap gap-2">
            {config.activeStandards.map((standardId) => (
              <Badge key={standardId} variant="outline" className="uppercase">
                {standardId}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {config.sections.map((section) => (
          <div key={section.id} className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <p className="text-xs text-muted-foreground">{section.description}</p>
            </div>
            <div className="space-y-4">
              {section.fields.map((field) => {
                const fieldId = `definition-standards-${field.key}`;
                const fieldValue = value[field.key];

                if (field.input === "switch") {
                  return (
                    <div key={field.key} className="flex items-start justify-between gap-4 rounded-lg border border-border/50 p-3">
                      <div className="space-y-1">
                        <Label htmlFor={fieldId}>{field.label}</Label>
                        <p className="text-xs text-muted-foreground">{field.description}</p>
                      </div>
                      <Switch
                        id={fieldId}
                        checked={Boolean(fieldValue)}
                        onCheckedChange={(checked) => onChange(field.key, checked as never)}
                      />
                    </div>
                  );
                }

                return (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={fieldId}>{field.label}</Label>
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                    {field.input === "textarea" ? (
                      <Textarea
                        id={fieldId}
                        value={typeof fieldValue === "string" ? fieldValue : ""}
                        placeholder={field.placeholder}
                        rows={3}
                        onChange={(event) => onChange(field.key, event.target.value as never)}
                      />
                    ) : (
                      <Input
                        id={fieldId}
                        type={field.input === "url" ? "url" : "text"}
                        value={typeof fieldValue === "string" ? fieldValue : ""}
                        placeholder={field.placeholder}
                        onChange={(event) => onChange(field.key, event.target.value as never)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
