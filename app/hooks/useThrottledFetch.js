import { useState, useEffect, useRef, useCallback } from 'react';

// Throttle function to limit API calls
const throttle = (func, delay) => {
  let timeoutId;
  let lastExecTime = 0;
  
  return function (...args) {
    const currentTime = Date.now();
    
    if (currentTime - lastExecTime > delay) {
      func.apply(this, args);
      lastExecTime = currentTime;
    } else {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
        lastExecTime = Date.now();
      }, delay - (currentTime - lastExecTime));
    }
  };
};

export const useThrottledFetch = (url, options = {}, throttleDelay = 1000) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);
  const lastFetchTimeRef = useRef(0);

  const fetchData = useCallback(async () => {
    // Prevent too frequent requests
    const now = Date.now();
    if (now - lastFetchTimeRef.current < throttleDelay) {
      return;
    }
    lastFetchTimeRef.current = now;

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(url, {
        ...options,
        signal: abortControllerRef.current.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        console.error('Fetch error:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [url, options, throttleDelay]);

  const throttledFetch = useCallback(
    throttle(fetchData, throttleDelay),
    [fetchData, throttleDelay]
  );

  useEffect(() => {
    throttledFetch();
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [throttledFetch]);

  const refetch = useCallback(() => {
    throttledFetch();
  }, [throttledFetch]);

  return { data, loading, error, refetch };
};

export default useThrottledFetch;
