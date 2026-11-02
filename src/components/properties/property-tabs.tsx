"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RentalType } from "@/lib/properties/labels";

export function PropertyTabs({
  rentalType,
  defaultTab = "overview",
  overview,
  leases,
  income,
  expenses,
  rates,
  documents,
}: {
  rentalType: RentalType;
  defaultTab?: string;
  overview: ReactNode;
  leases: ReactNode;
  income: ReactNode;
  expenses: ReactNode;
  rates: ReactNode;
  documents: ReactNode;
}) {
  const longTerm = rentalType === "long_term";
  const initialTab =
    defaultTab === "tenants" && !longTerm ? "overview" : defaultTab;

  return (
    <Tabs key={initialTab} defaultValue={initialTab}>
      <div className="overflow-x-auto">
        <TabsList className="w-max">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {longTerm ? (
            <TabsTrigger value="tenants">Tenants & Leases</TabsTrigger>
          ) : null}
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="rates">Rates & Levies</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="overview" className="pt-4">
        {overview}
      </TabsContent>
      {longTerm ? (
        <TabsContent value="tenants" className="pt-4">
          {leases}
        </TabsContent>
      ) : null}
      <TabsContent value="income" className="pt-4">
        {income}
      </TabsContent>
      <TabsContent value="expenses" className="pt-4">
        {expenses}
      </TabsContent>
      <TabsContent value="rates" className="pt-4">
        {rates}
      </TabsContent>
      <TabsContent value="documents" className="pt-4">
        {documents}
      </TabsContent>
    </Tabs>
  );
}
