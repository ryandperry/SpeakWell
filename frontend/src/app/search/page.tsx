'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { audioAPI, transcriptAPI } from '@/services/api';
import { AudioFile } from '@/types/audio';

interface SearchResult {
  audioId: string;
  audioTitle: string;
  audioUrl: string;
  audioDuration: number | null;
  audioSize: number;
  matches: Array<{
    text: string;
    startTime: number;
  }>;
}

export default function SearchPage() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, loading, router]);

  const loadAudioFiles = useCallback(async () => {
    try {
      const files = await audioAPI.getAllAudio();
      setAudioFiles(files.map(f => ({
        ...f,
        uploadedAt: new Date(f.uploadedAt)
      })));
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadAudioFiles();
    }
  }, [isAuthenticated, loadAudioFiles]);

  const performSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setSearching(true);
    setHasSearched(true);

    const completedFiles = audioFiles.filter(f => f.status === 'completed');
    const query = searchQuery.toLowerCase();

    const searchFile = async (file: AudioFile): Promise<SearchResult | null> => {
      try {
        const response = await transcriptAPI.getTranscript(file.id);

        if (response.status === 'completed' && response.transcript) {
          const words = response.transcript.words;
          const matches: Array<{ text: string; startTime: number }> = [];

          for (let i = 0; i < words.length; i++) {
            const contextWindow: string[] = [];
            for (let j = Math.max(0, i - 5); j < Math.min(words.length, i + 6); j++) {
              contextWindow.push(words[j].word);
            }
            const contextText = contextWindow.join(' ');

            if (contextText.toLowerCase().includes(query)) {
              const startWord = words[Math.max(0, i - 5)];
              matches.push({
                text: contextText,
                startTime: startWord.start
              });
              i += 5;
            }
          }

          if (matches.length > 0) {
            return {
              audioId: file.id,
              audioTitle: file.title,
              audioUrl: file.url,
              audioDuration: file.duration,
              audioSize: file.size,
              matches: matches.slice(0, 3)
            };
          }
        }
      } catch {
        // skip files with errors
      }
      return null;
    };

    const searchResults = await Promise.all(completedFiles.map(searchFile));
    const results = searchResults.filter((r): r is SearchResult => r !== null);

    setSearchResults(results);
    setSearching(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch();
  };

  const navigateToAudio = (result: SearchResult, startTime?: number) => {
    localStorage.setItem('currentAudio', JSON.stringify({
      id: result.audioId,
      title: result.audioTitle,
      duration: result.audioDuration,
      size: result.audioSize,
    }));
    router.push('/player');
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() 
        ? `<mark class="search-highlight">${part}</mark>` 
        : part
    ).join('');
  };

  if (loading || !isAuthenticated) {
    return null;
  }

  return (
    <main className="app-container studio-search studio-surface">
      <header className="app-header">
        <h1>Search transcripts</h1>
        <p>Find specific words or phrases across all your audio files</p>
      </header>

      <div className="search-content">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Search across all transcripts..."
            value={searchQuery}
            onChange={(e) => {
              const newValue = e.target.value;
              setSearchQuery(newValue);
              if (!newValue.trim()) {
                setSearchResults([]);
                setHasSearched(false);
              }
            }}
            className="search-input-main"
            autoFocus
          />
          <button 
            type="submit" 
            className="search-button"
            disabled={searching || !searchQuery.trim()}
          >
            {searching ? (
              <div className="button-spinner"></div>
            ) : (
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            )}
            Search
          </button>
        </form>

        {searching && (
          <div className="search-status">
            <div className="search-spinner"></div>
            <p>Searching through {audioFiles.filter(f => f.status === 'completed').length} transcripts...</p>
          </div>
        )}

        {!searching && hasSearched && searchResults.length === 0 && (
          <div className="search-empty">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <p>No results found for "{searchQuery}"</p>
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="search-results">
            <div className="results-header">
              Found {searchResults.length} file{searchResults.length !== 1 ? 's' : ''} with matches
            </div>
            {searchResults.map((result) => (
              <div key={result.audioId} className="search-result-card" onClick={() => navigateToAudio(result)}>
                <div className="result-header" onClick={() => navigateToAudio(result)}>
                  <svg className="result-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  <h3>{result.audioTitle}</h3>
                  <div className="result-badge">{result.matches.length} match{result.matches.length !== 1 ? 'es' : ''}</div>
                </div>
                <div className="result-matches">
                  {result.matches.map((match, idx) => (
                    <div 
                      key={idx} 
                      className="result-match"
                      onClick={() => navigateToAudio(result, match.startTime)}
                    >
                      <div className="match-text" dangerouslySetInnerHTML={{ 
                        __html: highlightMatch(match.text, searchQuery) 
                      }} />
                      <div className="match-time">
                        {Math.floor(match.startTime / 60)}:{String(Math.floor(match.startTime % 60)).padStart(2, '0')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!hasSearched && !searching && (
          <div className="search-placeholder">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <p>Enter a search term to find it across all your transcripts</p>
          </div>
        )}
      </div>
    </main>
  );
}
