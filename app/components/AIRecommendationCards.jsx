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
          const fifteenMinutesInMs = 15 * 60 * 1000; // 15 minutes cache

          if (now - timestamp < fifteenMinutesInMs) {
            setCurrentWeekRecommendations(currentWeek || "");
            setNextWeekRecommendations(nextWeek || "");
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

        // Handle structured JSON recommendations
        const recommendations = result.recommendations || {};

        let currentWeekFormatted = "No recommendations available";
        let nextWeekFormatted = "No targets available";

        if (recommendations.currentWeek && recommendations.nextWeek) {
          // Format with HTML-like structure for better UI
          currentWeekFormatted = recommendations.currentWeek
            .map((item, index) => {
              // Check if item contains conversation script
              if (
                item.includes('"') ||
                item.includes("Ask") ||
                item.includes("Say")
              ) {
                return `<div class="mb-3">
                    <h4 class="font-semibold text-blue-600 mb-1">${
                      index + 1
                    }. ${item.split('"')[0]?.trim() || item}</h4>
                    <div class="bg-blue-50 p-2 rounded text-sm italic">"${
                      item.split('"')[1] || ""
                    }"</div>
                   </div>`;
              } else {
                return `<div class="mb-2">
                   <h4 class="font-semibold text-gray-800 mb-1">${
                     index + 1
                   }. ${item}</h4>
                 </div>`;
              }
            })
            .join("");

          nextWeekFormatted = recommendations.nextWeek
            .map((item, index) => {
              if (
                item.includes('"') ||
                item.includes("Ask") ||
                item.includes("Say")
              ) {
                return `<div class="mb-3">
                   <h4 class="font-semibold text-green-600 mb-1">${
                     index + 1
                   }. ${item.split('"')[0]?.trim() || item}</h4>
                   <div class="bg-green-50 p-2 rounded text-sm italic">"${
                     item.split('"')[1] || ""
                   }"</div>
                 </div>`;
              } else {
                return `<div class="mb-2">
                   <h4 class="font-semibold text-gray-800 mb-1">${
                     index + 1
                   }. ${item}</h4>
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

  const RecommendationCard = ({ title, content, isLoading }) => (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
        <h3 className="text-sm sm:text-base font-semibold text-gray-800">
          {title}
        </h3>
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
    </div>
  );

  return (
    <div
      className={`grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 ${className}`}
    >
      <RecommendationCard
        title="🤖 Current Week AI Recommendations"
        content={currentWeekRecommendations}
        isLoading={loading}
      />
      <RecommendationCard
        title="🎯 Next Week Target AI Recommendations"
        content={nextWeekRecommendations}
        isLoading={loading}
      />
    </div>
  );
}
