"use client";

import Image from "next/image";
import { FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PreviewLabels = {
  example: string;
  imageAlt: string;
  title: string;
  caption: string;
  label: string;
  script: string;
  beats: string[];
  angles: { id: string; title: string; lines: string[] }[];
};

export function ScriptPreview({ labels }: { labels: PreviewLabels }) {
  return (
    <div className="bg-card min-w-0 overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <FileText className="size-4" aria-hidden />
          {labels.title}
        </span>
        <span
          className="text-muted-foreground font-mono text-xs"
          translate="no"
        >
          15s / 3
        </span>
      </div>
      <div className="flex items-center gap-4 px-5 py-5">
        <Image
          src="/images/home/product-tumbler.webp"
          alt={labels.imageAlt}
          width={56}
          height={72}
          className="h-18 w-14 rounded-md object-cover"
        />
        <div className="space-y-1">
          <p className="font-medium">{labels.caption}</p>
          <p className="text-muted-foreground text-xs">{labels.example}</p>
        </div>
      </div>
      <Tabs defaultValue="routine" className="gap-0">
        <div className="px-5">
          <p className="text-muted-foreground mb-3 text-sm">{labels.label}</p>
          <TabsList
            className="h-auto! w-full rounded-md"
            aria-label={labels.label}
          >
            {labels.angles.map((angle) => (
              <TabsTrigger
                className="data-[state=active]:text-primary min-h-11 min-w-0 rounded-md px-1.5 text-xs sm:px-3 sm:text-sm"
                key={angle.id}
                value={angle.id}
              >
                {angle.title}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {labels.angles.map((angle) => (
          <TabsContent
            key={angle.id}
            value={angle.id}
            className="px-5 pt-3 pb-5"
          >
            <ol aria-label={labels.script} className="divide-y">
              {angle.lines.map((line, index) => (
                <li key={line} className="grid grid-cols-[64px_1fr] gap-4 py-4">
                  <span
                    className="text-muted-foreground pt-1 font-mono text-xs"
                    translate="no"
                  >
                    {["00–03", "03–11", "11–15"][index]}
                  </span>
                  <div className="space-y-2">
                    <p className="text-primary text-xs font-medium">
                      {labels.beats[index]}
                    </p>
                    <p className="text-sm leading-6">{line}</p>
                  </div>
                </li>
              ))}
            </ol>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
