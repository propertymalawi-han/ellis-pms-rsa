import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";

export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <Card>
        <CardHeader>
          <CardTitle>Coming next</CardTitle>
          <CardDescription>
            This section is scaffolded. Data, forms and RLS-backed actions will
            land in later steps.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Nothing to show here yet.
        </CardContent>
      </Card>
    </div>
  );
}
