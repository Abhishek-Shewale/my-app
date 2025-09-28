"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useDebouncedCallback } from "use-debounce";

export default function AIRecommendationCards({
  dashboardType,
  data,
  month,
  className = "",
}) {
  const [currentWeekRecommendations, setCurrentWeekRecommendations] =
    useState("");
  const [nextWeekRecommendations, setNextWeekRecommendations] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recommendationTimestamp, setRecommendationTimestamp] = useState(null);

  // Function to make numbers bold in text (no blue highlighting)
  const makeNumbersBold = (text) => {
    return text.replace(/(\d+(?:\.\d+)?%?)/g, "<strong>$1</strong>");
  };

  // Function to extract actionable items from recommendation text (max 5 items)
  const extractActionableItems = (text) => {
    const items = [];
    console.log("Extracting from text:", text);

    // Try multiple patterns to catch different formats
    const patterns = [
      // Pattern 1: number + space + word(s) until next number, comma, period, or end
      /(\d+(?:\.\d+)?%?)\s+([a-zA-Z\s]+?)(?=\s*\d|,|\.|!|$)/g,
      // Pattern 2: number + space + word(s) (simpler)
      /(\d+(?:\.\d+)?%?)\s+([a-zA-Z]+)/g,
      // Pattern 3: number + space + word + optional space + word
      /(\d+(?:\.\d+)?%?)\s+([a-zA-Z]+\s*[a-zA-Z]*)/g,
    ];

    let numberMatches = [];
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        numberMatches = matches;
        break;
      }
    }

    console.log("Number matches found:", numberMatches);

    if (numberMatches) {
      numberMatches.forEach((match) => {
        const parts = match.trim().split(/\s+/);
        if (parts.length >= 2 && items.length < 5) {
          const number = parts[0];
          const action = parts.slice(1).join(" ").toLowerCase();
          // Clean up the action text
          const cleanAction = action.replace(/[.,!?]$/, "").trim();
          if (number && cleanAction && cleanAction.length > 0) {
            items.push({ number, action: cleanAction });
          }
        }
      });
    }
    console.log("Extracted items:", items);
    return items.slice(0, 5); // Limit to 5 items
  };

  // Debounced function to fetch recommendations
  const debouncedFetchRecommendations = useDebouncedCallback(
    async (type, dashboardData, selectedMonth) => {
      if (!dashboardData || !type) return;

      setLoading(true);
      setError(null);

      try {
        const cacheKey = `ai-recommendations-${type}-${selectedMonth}`;
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
          const { currentWeek, nextWeek, timestamp } = JSON.parse(cached);
          const now = new Date().getTime();
          const oneDayInMs = 24 * 60 * 60 * 1000; // 24 hours cache

          if (now - timestamp < oneDayInMs) {
            setCurrentWeekRecommendations(currentWeek || "");
            setNextWeekRecommendations(nextWeek || "");
            setRecommendationTimestamp(new Date(timestamp));
            setLoading(false);
            return;
          }
        }

        // Fetch from API
        const response = await fetch("/api/ai-recommendations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dashboardType: type,
            data: dashboardData,
            month: selectedMonth,
          }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();

        if (result.error) {
          throw new Error(result.error);
        }

        // Store timestamp
        setRecommendationTimestamp(new Date(result.timestamp || new Date()));

        // Handle structured JSON recommendations
        const recommendations = result.recommendations || {};

        let currentWeekFormatted = "No recommendations available";
        let nextWeekFormatted = "No targets available";

        if (recommendations.currentWeek && recommendations.nextWeek) {
          // Format with HTML-like structure for better UI
          currentWeekFormatted = recommendations.currentWeek
            .map((item, index) => {
              // Check if item contains conversation script
              const hasQuotes = item.includes('"');
              const hasAsk = item.includes("Ask");
              const hasSay = item.includes("Say");

              if (hasQuotes || hasAsk || hasSay) {
                // Extract conversation script more accurately
                let title = item;
                let script = "";

                if (hasQuotes) {
                  const quoteMatch = item.match(/"([^"]+)"/);
                  if (quoteMatch) {
                    script = quoteMatch[1];
                    title = item.replace(/"([^"]+)"/, "").trim();
                  }
                } else if (hasAsk) {
                  const askMatch = item.match(/Ask[^:]*:\s*["']([^"']+)["']/);
                  if (askMatch) {
                    script = askMatch[1];
                    title = item
                      .replace(/Ask[^:]*:\s*["']([^"']+)["']/, "")
                      .trim();
                  }
                } else if (hasSay) {
                  const sayMatch = item.match(/Say[^:]*:\s*["']([^"']+)["']/);
                  if (sayMatch) {
                    script = sayMatch[1];
                    title = item
                      .replace(/Say[^:]*:\s*["']([^"']+)["']/, "")
                      .trim();
                  }
                }

                return `<div class="mb-3">
                    <h4 class="font-semibold text-blue-600 mb-1">${
                      index + 1
                    }. ${makeNumbersBold(title)}</h4>
                    ${
                      script
                        ? `<div class="bg-blue-50 p-2 rounded text-sm italic">"${makeNumbersBold(
                            script
                          )}"</div>`
                        : ""
                    }
                   </div>`;
              } else {
                return `<div class="mb-2">
                   <h4 class="font-semibold text-gray-800 mb-1">${
                     index + 1
                   }. ${makeNumbersBold(item)}</h4>
                 </div>`;
              }
            })
            .join("");

          nextWeekFormatted = recommendations.nextWeek
            .map((item, index) => {
              const hasQuotes = item.includes('"');
              const hasAsk = item.includes("Ask");
              const hasSay = item.includes("Say");

              if (hasQuotes || hasAsk || hasSay) {
                // Extract conversation script more accurately
                let title = item;
                let script = "";

                if (hasQuotes) {
                  const quoteMatch = item.match(/"([^"]+)"/);
                  if (quoteMatch) {
                    script = quoteMatch[1];
                    title = item.replace(/"([^"]+)"/, "").trim();
                  }
                } else if (hasAsk) {
                  const askMatch = item.match(/Ask[^:]*:\s*["']([^"']+)["']/);
                  if (askMatch) {
                    script = askMatch[1];
                    title = item
                      .replace(/Ask[^:]*:\s*["']([^"']+)["']/, "")
                      .trim();
                  }
                } else if (hasSay) {
                  const sayMatch = item.match(/Say[^:]*:\s*["']([^"']+)["']/);
                  if (sayMatch) {
                    script = sayMatch[1];
                    title = item
                      .replace(/Say[^:]*:\s*["']([^"']+)["']/, "")
                      .trim();
                  }
                }

                return `<div class="mb-3">
                    <h4 class="font-semibold text-green-600 mb-1">${
                      index + 1
                    }. ${makeNumbersBold(title)}</h4>
                    ${
                      script
                        ? `<div class="bg-green-50 p-2 rounded text-sm italic">"${makeNumbersBold(
                            script
                          )}"</div>`
                        : ""
                    }
                   </div>`;
              } else {
                return `<div class="mb-2">
                    <h4 class="font-semibold text-gray-800 mb-1">${
                      index + 1
                    }. ${makeNumbersBold(item)}</h4>
                   </div>`;
              }
            })
            .join("");
        }

        setCurrentWeekRecommendations(currentWeekFormatted);
        setNextWeekRecommendations(nextWeekFormatted);

        // Cache the results
        const cacheData = {
          currentWeek: currentWeekFormatted,
          nextWeek: nextWeekFormatted,
          timestamp: new Date().getTime(),
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      } catch (err) {
        console.error("Error fetching AI recommendations:", err);
        setError(err.message || "Failed to load recommendations");
      } finally {
        setLoading(false);
      }
    },
    300 // 300ms debounce
  );

  // Trigger recommendations when data changes
  useEffect(() => {
    if (data && dashboardType && month) {
      debouncedFetchRecommendations(dashboardType, data, month);
    }
  }, [data, dashboardType, month, debouncedFetchRecommendations]);

  const RecommendationCard = ({
    title,
    content,
    isLoading,
    actionableItems = [],
  }) => (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          <h3 className="text-sm sm:text-base font-semibold text-gray-800">
            {title}
          </h3>
        </div>
        {recommendationTimestamp && (
          <div className="text-xs text-gray-500">
            {recommendationTimestamp.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </div>

      <div className="min-h-[120px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-24">
            <div className="flex items-center gap-2 text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
              <span className="text-sm">Generating AI recommendations...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-24 text-red-500 text-sm">
            <div className="text-center">
              <div className="text-red-400 mb-1">⚠️</div>
              <div>Failed to load recommendations</div>
            </div>
          </div>
        ) : content ? (
          <div
            className="text-sm text-gray-700 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          <div className="flex items-center justify-center h-24 text-gray-400 text-sm">
            No recommendations available
          </div>
        )}
      </div>

      {/* Actionable Items Section - Left side layout */}
      {actionableItems.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="grid grid-cols-1 gap-3">
            {actionableItems.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-3 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg"
              >
                <span className="text-4xl font-bold text-blue-800">
                  {item.number}
                </span>
                <span className="text-sm font-medium">{item.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Extract actionable items from recommendations (max 5 items each)
  const currentWeekActionableItems = currentWeekRecommendations
    ? extractActionableItems(currentWeekRecommendations.replace(/<[^>]*>/g, ""))
    : [];
  const nextWeekActionableItems = nextWeekRecommendations
    ? extractActionableItems(nextWeekRecommendations.replace(/<[^>]*>/g, ""))
    : [];

  return (
    <div
      className={`grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 ${className}`}
    >
      <RecommendationCard
        title="🤖 Current Week AI Recommendations"
        content={currentWeekRecommendations}
        isLoading={loading}
        actionableItems={currentWeekActionableItems}
      />
      <RecommendationCard
        title="🎯 Next Week Target AI Recommendations"
        content={nextWeekRecommendations}
        isLoading={loading}
        actionableItems={nextWeekActionableItems}
      />
    </div>
  );
}
