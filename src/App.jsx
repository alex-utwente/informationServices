import { useEffect, useState } from "react";

const progressKeyframes = `
  @keyframes progress-slide {
    0% {
      transform: translateX(-120%);
    }
    100% {
      transform: translateX(280%);
    }
  }
`;

const ITEMS_PER_PAGE = 10;

const getSectionFromHash = () => {
  const hash = window.location.hash.replace("#", "");
  return hash === "favorites" ? "favorites" : "laws";
};

function App() {
  const [activeSection, setActiveSection] = useState(getSectionFromHash);
  const [laws, setLaws] = useState([]);
  const [explanations, setExplanations] = useState({});
  const [expandedExplanations, setExpandedExplanations] = useState({});
  const [explanationLanguage, setExplanationLanguage] = useState("en");
  const [loadingExplainId, setLoadingExplainId] = useState(null);
  const [explainStartedAt, setExplainStartedAt] = useState(null);
  const [progressElapsedMs, setProgressElapsedMs] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [deletingLawId, setDeletingLawId] = useState(null);
  const [favoriteUpdatingId, setFavoriteUpdatingId] = useState(null);
  const [generateMessage, setGenerateMessage] = useState("");
  const [questionInputs, setQuestionInputs] = useState({});
  const [questionAnswers, setQuestionAnswers] = useState({});
  const [loadingAskId, setLoadingAskId] = useState(null);
  const [biasResults, setBiasResults] = useState({});
  const [evaluatingBiasIds, setEvaluatingBiasIds] = useState({});

  const favoriteCount = laws.filter((law) => law.favorite).length;

  const getLawDisplayContent = (law) => {
    if (law.raw_data) {
      return JSON.stringify(law.raw_data, null, 2);
    }

    return law.text || "";
  };

  const getExplanationKey = (itemId, language = explanationLanguage) =>
    `${itemId}:${language}`;

  const loadLaws = async () => {
    try {
      const res = await fetch("http://localhost:8000/laws");
      const json = await res.json();
      setLaws(json);
    } catch (error) {
      console.error("Error loading laws:", error);
    }
  };

  useEffect(() => {
    loadLaws();
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      setActiveSection(getSectionFromHash());
      setCurrentPage(1);
    };

    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    if (!loadingExplainId || !explainStartedAt) {
      setProgressElapsedMs(0);
      return undefined;
    }

    const updateElapsed = () => {
      setProgressElapsedMs(Date.now() - explainStartedAt);
    };

    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadingExplainId, explainStartedAt]);

  const filteredItems =
    activeSection === "favorites"
      ? laws.filter((law) => law.favorite)
      : laws;

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentItems = filteredItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      setCurrentPage(1);
      return;
    }

    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleSectionChange = (section) => {
    window.location.hash = section === "favorites" ? "favorites" : "laws";
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateMessage("");

    try {
      const res = await fetch("http://localhost:8000/generate", {
        method: "POST"
      });
      const json = await res.json();

      setGenerateMessage(json.message || "Generation finished.");
      await loadLaws();
      handleSectionChange("laws");
    } catch (error) {
      console.error("Error generating law:", error);
      setGenerateMessage("Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteLaw = async (lawId) => {
    setDeletingLawId(lawId);
    setGenerateMessage("");

    try {
      const res = await fetch(`http://localhost:8000/laws/${lawId}`, {
        method: "DELETE"
      });
      const json = await res.json();

      setGenerateMessage(json.message || "Law deleted.");
      setExplanations((prev) => {
        const updated = { ...prev };
        delete updated[getExplanationKey(lawId, "en")];
        delete updated[getExplanationKey(lawId, "nl")];
        return updated;
      });
      setExpandedExplanations((prev) => {
        const updated = { ...prev };
        delete updated[lawId];
        return updated;
      });
      setQuestionAnswers((prev) => {
        const updated = { ...prev };
        delete updated[lawId];
        return updated;
      });
      setQuestionInputs((prev) => {
        const updated = { ...prev };
        delete updated[lawId];
        return updated;
      });
      await loadLaws();
    } catch (error) {
      console.error("Error deleting law:", error);
      setGenerateMessage("Deleting law failed.");
    } finally {
      setDeletingLawId(null);
    }
  };

  const handleToggleFavorite = async (lawId) => {
    setFavoriteUpdatingId(lawId);
    setGenerateMessage("");

    try {
      const res = await fetch(`http://localhost:8000/laws/${lawId}/favorite`, {
        method: "PATCH"
      });
      const json = await res.json();

      setGenerateMessage(json.message || "Favorite updated.");
      await loadLaws();
    } catch (error) {
      console.error("Error updating favorite:", error);
      setGenerateMessage("Updating favorite failed.");
    } finally {
      setFavoriteUpdatingId(null);
    }
  };

  const handleExplain = async (item) => {
    const explanationKey = getExplanationKey(item.id);

    if (explanations[explanationKey]) {
      setExpandedExplanations((prev) => ({ ...prev, [item.id]: true }));
      return;
    }

    setLoadingExplainId(item.id);
    setExplainStartedAt(Date.now());

    try {
      const content = getLawDisplayContent(item);

      const res = await fetch("http://localhost:8000/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: item.type,
          title: item.title,
          source: item.creator,
          content,
          language: explanationLanguage
        })
      });

      const json = await res.json();
      setExplanations((prev) => ({ ...prev, [explanationKey]: json }));
      setExpandedExplanations((prev) => ({ ...prev, [item.id]: true }));

      setEvaluatingBiasIds((prev) => ({ ...prev, [item.id]: true }));
      try {
        const biasRes = await fetch("http://localhost:8000/evaluate-bias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input_text: content,
            target_response: JSON.stringify(json)
          })
        });
        const biasJson = await biasRes.json();
        setBiasResults((prev) => ({ ...prev, [explanationKey]: biasJson }));
      } catch (biasError) {
        console.error("Error fetching bias:", biasError);
      } finally {
        setEvaluatingBiasIds((prev) => ({ ...prev, [item.id]: false }));
      }
    } catch (error) {
      console.error("Error fetching explanation:", error);
    } finally {
      setLoadingExplainId(null);
      setExplainStartedAt(null);
    }
  };

  const formatElapsedTime = (elapsedMs) => {
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const handleHideExplanation = (itemId) => {
    setExpandedExplanations((prev) => ({
      ...prev,
      [itemId]: false
    }));
  };

  const handleQuestionChange = (itemId, value) => {
    setQuestionInputs((prev) => ({
      ...prev,
      [itemId]: value
    }));
  };

  const handleSendQuestion = async (item) => {
    setLoadingAskId(item.id);

    try {
      const explanationKey = getExplanationKey(item.id);
      const explanation = explanations[explanationKey];
      const res = await fetch("http://localhost:8000/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: item.title,
          content: getLawDisplayContent(item),
          question: questionInputs[item.id] || "",
          summary: explanation?.overview || ""
        })
      });

      const json = await res.json();

      setQuestionAnswers((prev) => ({
        ...prev,
        [item.id]: json.overview || json.answer
      }));
    } catch (error) {
      console.error("Error fetching answer:", error);
    } finally {
      setLoadingAskId(null);
    }
  };

  return (
    <div style={styles.page}>
      <style>{progressKeyframes}</style>
      <h1 style={styles.title}>Information Service Tool</h1>
      <p style={styles.subtitle}>
        Read current topics, policies, and local rules, then get simple explanations.
      </p>

      <div style={styles.menu}>
        <button
          style={{
            ...styles.menuButton,
            ...(activeSection === "laws" ? styles.menuButtonActive : {})
          }}
          onClick={() => handleSectionChange("laws")}
        >
          Laws
        </button>
        <button
          style={{
            ...styles.menuButton,
            ...(activeSection === "favorites" ? styles.menuButtonActive : {})
          }}
          onClick={() => handleSectionChange("favorites")}
        >
          Favorites ({favoriteCount})
        </button>
        <button
          style={{
            ...styles.generateButton,
            ...(isGenerating ? styles.generateButtonDisabled : {})
          }}
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? "Generating..." : "Generate"}
        </button>
      </div>

      {generateMessage && <p style={styles.generateMessage}>{generateMessage}</p>}

      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionHeading}>
          {activeSection === "favorites" ? "Favorite Laws" : "Laws and Policies"}
        </h2>
        <p style={styles.sectionDescription}>
          {activeSection === "favorites"
            ? "Review every law you marked as favorite."
            : "Browse the predefined laws and policies available for explanation."}
        </p>
      </div>

      <div style={styles.articleList}>
        {currentItems.length === 0 && (
          <div style={styles.emptyState}>
            {activeSection === "favorites"
              ? "No favorite laws yet. Mark a law as favorite to see it here."
              : "No laws have been posted yet. Send data to the law endpoint and they will appear here."}
          </div>
        )}

        {currentItems.map((item) => {
          const explanationKey = getExplanationKey(item.id);
          const explanation = explanations[explanationKey];
          const isExplanationExpanded = expandedExplanations[item.id];
          const biasResult = biasResults[explanationKey];
          const isEvaluatingBias = evaluatingBiasIds[item.id];

          return (
            <div key={item.id} style={styles.card}>
              <div style={styles.tagRow}>
                <span style={styles.typeTag}>Law / Policy</span>
                {item.favorite && <span style={styles.favoriteBadge}>Favorite</span>}
              </div>

              <h2 style={styles.articleTitle}>{item.title}</h2>
              <p style={styles.metaText}>Creator: {item.creator}</p>
              <a href={item.url} target="_blank" rel="noreferrer" style={styles.urlLink}>
                {item.url}
              </a>

              <div style={styles.originalBox}>
                <h3 style={styles.sectionTitle}>Original Law / Policy Data</h3>
                <div style={styles.scrollBox}>
                  <pre style={styles.codeBlock}>{getLawDisplayContent(item)}</pre>
                </div>
              </div>

              <div style={styles.actionRow}>
                <button
                  style={{
                    ...styles.favoriteButton,
                    ...(item.favorite ? styles.favoriteButtonActive : {})
                  }}
                  onClick={() => handleToggleFavorite(item.id)}
                  disabled={favoriteUpdatingId === item.id}
                >
                  {favoriteUpdatingId === item.id
                    ? "Saving..."
                    : item.favorite
                      ? "★ Unfollow"
                      : "★ Follow"}
                </button>
                <button
                  style={styles.deleteButton}
                  onClick={() => handleDeleteLaw(item.id)}
                  disabled={deletingLawId === item.id}
                >
                  {deletingLawId === item.id ? "Deleting..." : "Delete"}
                </button>
                <button
                  style={!explanation || !isExplanationExpanded ? styles.button : styles.hideButton}
                  onClick={() =>
                    !explanation || !isExplanationExpanded
                      ? handleExplain(item)
                      : handleHideExplanation(item.id)
                  }
                  disabled={loadingExplainId === item.id}
                >
                  {!explanation || !isExplanationExpanded
                    ? loadingExplainId === item.id
                      ? "Loading..."
                      : explanation
                        ? "Show explanation"
                        : "Explain"
                    : "Hide explanation"}
                </button>
                {activeSection === "favorites" && (
                  <button type="button" style={styles.refreshButton}>
                    Refresh
                  </button>
                )}
              </div>

              {explanation && isExplanationExpanded && (
                <>
                  <div style={styles.explanationBox}>
                    <div style={styles.explanationHeader}>
                      <h3 style={styles.sectionTitle}>Explanation</h3>
                      <select
                        value={explanationLanguage}
                        onChange={(e) => setExplanationLanguage(e.target.value)}
                        style={styles.languageSelect}
                      >
                        <option value="en">English</option>
                        <option value="nl">Dutch</option>
                      </select>
                    </div>

                    {explanation.error ? (
                      <div style={styles.block}>
                        <p style={styles.heading}>Processing Error</p>
                        <p style={styles.contentText}>{explanation.error}</p>
                      </div>
                    ) : (
                      <>
                        <div style={styles.block}>
                          <p style={styles.heading}>Title</p>
                          <p style={styles.contentText}>{explanation.title}</p>
                        </div>

                        <div style={styles.block}>
                          <p style={styles.heading}>Overview</p>
                          <p style={styles.contentText}>{explanation.overview}</p>
                        </div>

                        <div style={styles.block}>
                          <p style={styles.heading}>Expected Impacts</p>
                          <ul style={styles.list}>
                            {explanation.expected_impacts?.map((impact, index) => (
                              <li key={index} style={styles.listItem}>
                                {impact}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div style={styles.block}>
                          <p style={styles.heading}>Key Changes</p>
                          <ul style={styles.list}>
                            {explanation.key_changes?.map((change, index) => (
                              <li key={index} style={styles.listItem}>
                                {change}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div style={styles.block}>
                          <p style={styles.heading}>Trade-offs</p>
                          <ul style={styles.list}>
                            {explanation.trade_offs?.map((trade, index) => (
                              <li key={index} style={styles.listItem}>
                                {trade}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div style={styles.block}>
                          <p style={styles.heading}>Meaning for Resident</p>
                          <p style={styles.contentText}>{explanation.meaning_for_resident}</p>
                        </div>
                      </>
                    )}

                    <div style={styles.biasBox}>
                      <p style={styles.heading}>Bias Evaluation</p>
                      {isEvaluatingBias ? (
                        <p style={styles.biasPendingText}>Evaluating response for bias...</p>
                      ) : biasResult?.error ? (
                        <p style={styles.biasErrorText}>
                          Failed to evaluate bias: {biasResult.error}
                        </p>
                      ) : biasResult ? (
                        <>
                          <div
                            style={{
                              ...styles.biasScore,
                              color: biasResult.score > 0.5 ? "#b91c1c" : "#15803d"
                            }}
                          >
                            Score: {biasResult.score}{" "}
                            {biasResult.score > 0.5 ? "(Detected Bias)" : "(Unbiased)"}
                          </div>
                          <p style={styles.biasReasonText}>
                            <strong>Reasoning:</strong> {biasResult.reason || "No reasoning provided."}
                          </p>
                        </>
                      ) : (
                        <p style={styles.biasPendingText}>Bias not evaluated.</p>
                      )}
                    </div>

                    <div style={styles.askBox}>
                      <p style={styles.heading}>Ask anything about this law</p>

                      <textarea
                        value={questionInputs[item.id] || ""}
                        onChange={(e) => handleQuestionChange(item.id, e.target.value)}
                        placeholder="Type your question here..."
                        style={styles.textarea}
                      />

                      <button
                        style={styles.sendButton}
                        onClick={() => handleSendQuestion(item)}
                        disabled={loadingAskId === item.id}
                      >
                        {loadingAskId === item.id ? "Sending..." : "Send"}
                      </button>

                      {questionAnswers[item.id] && (
                        <div style={styles.answerBox}>
                          <p style={styles.heading}>Answer</p>
                          <p style={styles.contentText}>{questionAnswers[item.id]}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {loadingExplainId === item.id && (
                <div style={styles.progressCard}>
                  <p style={styles.progressTitle}>Processing with local LLM</p>
                  <div style={styles.progressTrack}>
                    <div style={styles.progressBar} />
                  </div>
                  <p style={styles.progressText}>
                    Elapsed time: {formatElapsedTime(progressElapsedMs)}
                  </p>
                  <p style={styles.progressHint}>
                    This shows active processing while the model works. The current
                    local API does not expose a true completion percentage for prompt
                    processing.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredItems.length > 0 && (
        <div style={styles.pagination}>
          <button
            style={{
              ...styles.pageButton,
              opacity: currentPage === 1 ? 0.5 : 1,
              cursor: currentPage === 1 ? "not-allowed" : "pointer"
            }}
            onClick={() => setCurrentPage((prev) => prev - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </button>

          <span style={styles.pageInfo}>
            Page {currentPage} of {totalPages}
          </span>

          <button
            style={{
              ...styles.pageButton,
              opacity: currentPage === totalPages ? 0.5 : 1,
              cursor: currentPage === totalPages ? "not-allowed" : "pointer"
            }}
            onClick={() => setCurrentPage((prev) => prev + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    width: "100%",
    margin: "0 auto",
    padding: "30px",
    fontFamily: "Arial, sans-serif",
    backgroundColor: "#f3f4f6",
    minHeight: "100vh",
    boxSizing: "border-box"
  },
  title: {
    textAlign: "center",
    marginBottom: "10px",
    color: "#111827"
  },
  subtitle: {
    textAlign: "center",
    color: "#374151",
    marginBottom: "30px"
  },
  menu: {
    display: "flex",
    justifyContent: "center",
    gap: "12px",
    marginBottom: "24px",
    flexWrap: "wrap"
  },
  generateButton: {
    padding: "10px 18px",
    borderRadius: "999px",
    border: "1px solid #0f766e",
    backgroundColor: "#0f766e",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "700"
  },
  generateButtonDisabled: {
    opacity: 0.7,
    cursor: "not-allowed"
  },
  refreshButton: {
    padding: "10px 16px",
    border: "none",
    borderRadius: "8px",
    backgroundColor: "#0f172a",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "700"
  },
  menuButton: {
    padding: "10px 18px",
    borderRadius: "999px",
    border: "1px solid #cbd5e1",
    backgroundColor: "#ffffff",
    color: "#1f2937",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "700"
  },
  menuButtonActive: {
    backgroundColor: "#1d4ed8",
    borderColor: "#1d4ed8",
    color: "#ffffff"
  },
  sectionHeader: {
    maxWidth: "960px",
    margin: "0 auto 24px",
    textAlign: "center"
  },
  generateMessage: {
    textAlign: "center",
    color: "#0f766e",
    marginTop: "-10px",
    marginBottom: "20px",
    fontWeight: "600"
  },
  sectionHeading: {
    margin: "0 0 8px",
    color: "#111827"
  },
  sectionDescription: {
    margin: 0,
    color: "#4b5563"
  },
  articleList: {
    display: "flex",
    flexDirection: "column",
    gap: "25px",
    maxWidth: "1100px",
    margin: "0 auto"
  },
  emptyState: {
    backgroundColor: "#ffffff",
    padding: "22px",
    borderRadius: "12px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    color: "#374151",
    textAlign: "center"
  },
  card: {
    backgroundColor: "#ffffff",
    padding: "22px",
    borderRadius: "12px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    textAlign: "left"
  },
  tagRow: {
    marginBottom: "10px",
    display: "flex",
    gap: "8px",
    alignItems: "center",
    flexWrap: "wrap"
  },
  typeTag: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    backgroundColor: "#dcfce7",
    color: "#166534"
  },
  favoriteBadge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    backgroundColor: "#fef3c7",
    color: "#92400e"
  },
  articleTitle: {
    marginBottom: "8px",
    color: "#111827"
  },
  metaText: {
    color: "#374151",
    fontSize: "14px",
    marginBottom: "8px"
  },
  urlLink: {
    display: "inline-block",
    color: "#1d4ed8",
    fontSize: "14px",
    marginBottom: "15px",
    wordBreak: "break-all"
  },
  originalBox: {
    backgroundColor: "#e5e7eb",
    padding: "15px",
    borderRadius: "8px",
    marginBottom: "15px"
  },
  scrollBox: {
    maxHeight: "15.5rem",
    overflowY: "auto",
    paddingRight: "8px"
  },
  codeBlock: {
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "Consolas, Monaco, monospace",
    fontSize: "14px",
    lineHeight: "1.55",
    color: "#1f2937"
  },
  actionRow: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "14px",
    justifyContent: "center",
    alignItems: "center"
  },
  button: {
    padding: "10px 16px",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    backgroundColor: "#2563eb",
    color: "white",
    fontSize: "14px"
  },
  hideButton: {
    padding: "10px 16px",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    backgroundColor: "#475569",
    color: "white",
    fontSize: "14px"
  },
  favoriteButton: {
    padding: "10px 16px",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    backgroundColor: "#f59e0b",
    color: "white",
    fontSize: "14px"
  },
  favoriteButtonActive: {
    backgroundColor: "#d97706"
  },
  deleteButton: {
    padding: "10px 16px",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    backgroundColor: "#b91c1c",
    color: "white",
    fontSize: "14px"
  },
  explanationBox: {
    backgroundColor: "#dbeafe",
    padding: "16px",
    borderRadius: "8px",
    marginTop: "20px"
  },
  explanationHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "12px",
    flexWrap: "wrap"
  },
  progressCard: {
    marginTop: "16px",
    padding: "16px",
    borderRadius: "8px",
    backgroundColor: "#eff6ff",
    border: "1px solid #bfdbfe"
  },
  progressTitle: {
    margin: "0 0 8px",
    color: "#1d4ed8",
    fontWeight: "700"
  },
  progressTrack: {
    position: "relative",
    overflow: "hidden",
    width: "100%",
    height: "12px",
    borderRadius: "999px",
    backgroundColor: "#dbeafe"
  },
  progressBar: {
    width: "40%",
    height: "100%",
    borderRadius: "999px",
    background: "linear-gradient(90deg, #2563eb 0%, #60a5fa 100%)",
    animation: "progress-slide 1.5s ease-in-out infinite"
  },
  progressText: {
    margin: "10px 0 0",
    color: "#1e3a8a",
    fontSize: "14px"
  },
  progressHint: {
    margin: "6px 0 0",
    color: "#1e40af",
    fontSize: "13px",
    lineHeight: "1.5"
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: "10px",
    color: "#111827"
  },
  languageSelect: {
    border: "1px solid #93c5fd",
    borderRadius: "999px",
    backgroundColor: "#ffffff",
    color: "#1e3a8a",
    padding: "8px 12px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer"
  },
  block: {
    marginBottom: "18px"
  },
  heading: {
    fontWeight: "700",
    fontSize: "17px",
    color: "#0f172a",
    marginBottom: "8px"
  },
  contentText: {
    color: "#1f2937",
    lineHeight: "1.7",
    margin: 0
  },
  list: {
    marginTop: "8px",
    marginBottom: 0,
    paddingLeft: "20px"
  },
  listItem: {
    color: "#1f2937",
    marginBottom: "6px",
    lineHeight: "1.6"
  },
  biasBox: {
    backgroundColor: "#f8fafc",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "18px"
  },
  biasPendingText: {
    color: "#64748b",
    fontSize: "14px",
    fontStyle: "italic"
  },
  biasErrorText: {
    color: "#b91c1c",
    fontSize: "14px"
  },
  biasScore: {
    marginBottom: "8px",
    fontWeight: "700"
  },
  biasReasonText: {
    color: "#1f2937",
    fontSize: "14px",
    margin: 0
  },
  askBox: {
    marginTop: "24px",
    padding: "14px",
    backgroundColor: "#eff6ff",
    borderRadius: "8px"
  },
  textarea: {
    width: "100%",
    minHeight: "90px",
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    marginBottom: "12px",
    resize: "vertical",
    boxSizing: "border-box"
  },
  sendButton: {
    padding: "10px 16px",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    backgroundColor: "#0f766e",
    color: "white",
    fontSize: "14px"
  },
  answerBox: {
    marginTop: "16px",
    padding: "12px",
    backgroundColor: "#ffffff",
    borderRadius: "8px"
  },
  pagination: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "16px",
    marginTop: "30px",
    paddingBottom: "20px",
    flexWrap: "wrap"
  },
  pageButton: {
    padding: "10px 14px",
    border: "none",
    borderRadius: "8px",
    backgroundColor: "#1d4ed8",
    color: "white"
  },
  pageInfo: {
    color: "#111827",
    fontWeight: "600"
  }
};

export default App;
