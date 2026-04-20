"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrapeControl } from "./scrape-control";
import { ReviewsList } from "./reviews-list";

export type KnownAsin = {
  asin: string;
  title: string | null;
  brand: string | null;
};

export function ReviewsPage() {
  const [asins, setAsins] = useState<KnownAsin[]>([]);
  const [selectedAsin, setSelectedAsin] = useState<string | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  const loadAsins = useCallback(async () => {
    try {
      const res = await fetch("/api/reviews/asins");
      const json = await res.json();
      if (json.ok) {
        setAsins(json.data.asins);
        setSelectedAsin((prev) => prev ?? json.data.asins[0]?.asin ?? null);
      }
    } catch (err) {
      console.error("Failed to load ASINs:", err);
    }
  }, []);

  useEffect(() => {
    loadAsins();
  }, [loadAsins]);

  const handleJobCompleted = useCallback(
    (asin: string) => {
      loadAsins();
      setSelectedAsin(asin);
      setListRefreshKey((k) => k + 1);
    },
    [loadAsins]
  );

  return (
    <div className="space-y-4 md:space-y-6 px-3 md:px-6 py-4 md:py-5">
      <ScrapeControl
        knownAsins={asins}
        onJobCompleted={handleJobCompleted}
      />
      <ReviewsList
        knownAsins={asins}
        selectedAsin={selectedAsin}
        onSelectAsin={setSelectedAsin}
        refreshKey={listRefreshKey}
      />
    </div>
  );
}
