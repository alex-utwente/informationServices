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

const items = [
  {
    id: 1,
    type: "article",
    title: "Why fuel prices remain high in the Netherlands",
    source: "Example News",
    content:
      "Fuel prices in the Netherlands remain high due to a combination of international oil prices, taxes, refining costs, and transportation expenses. Many citizens are asking why the government cannot simply limit the final price at the pump."
  },
  {
    id: 2,
    type: "article",
    title: "Why housing policy changes take time",
    source: "Public Affairs Daily",
    content:
      "The Dutch housing market continues to face pressure. Rent, supply shortages, permits, and construction costs all affect how quickly new housing policy can improve the situation. Many people wonder why change seems so slow."
  },
  {
    id: 3,
    type: "article",
    title: "Why tax reforms are implemented gradually",
    source: "National Policy Journal",
    content:
      "Tax reforms often take time because they affect workers, businesses, and public services. Governments usually phase in changes to reduce disruption."
  },
  {
    id: 4,
    type: "article",
    title: "Why energy transition policies affect households",
    source: "Energy Review",
    content:
      "Policies supporting greener energy can influence household costs in the short term, even if they aim to reduce long-term dependence on fossil fuels."
  },
  {
    id: 5,
    type: "article",
    title: "Why migration policy is debated so strongly",
    source: "Civic Monitor",
    content:
      "Migration policy involves legal obligations, labor needs, housing capacity, and public opinion, which makes it a frequent topic of political debate."
  },
  {
    id: 6,
    type: "article",
    title: "Why inflation affects public budgets",
    source: "Economic Times",
    content:
      "When inflation rises, governments may need to spend more on wages, benefits, and procurement, which can affect budget planning."
  },
  {
    id: 7,
    type: "article",
    title: "Why public transport prices increase",
    source: "Transit Daily",
    content:
      "Public transport fares may rise due to energy costs, staff shortages, maintenance expenses, and investment in infrastructure."
  },
  {
    id: 8,
    type: "article",
    title: "Why healthcare reforms take years",
    source: "Health Policy Today",
    content:
      "Healthcare reforms often involve insurers, hospitals, doctors, and regulation, which makes large system changes difficult to implement quickly."
  },
  {
    id: 9,
    type: "article",
    title: "Why education policy changes slowly",
    source: "Education Weekly",
    content:
      "Education policy usually changes gradually because new rules affect schools, teachers, exams, funding, and curriculum planning."
  },
  {
    id: 10,
    type: "article",
    title: "Why governments borrow money",
    source: "Public Finance Review",
    content:
      "Governments borrow to finance major spending, spread costs over time, or respond to crises, but borrowing also increases future debt obligations."
  },
  {
    id: 11,
    type: "article",
    title: "Why climate policy involves trade-offs",
    source: "Green Policy Report",
    content:
      "Climate policy can create trade-offs between environmental goals, household costs, industrial competitiveness, and energy security."
  },
  {
    id: 12,
    type: "article",
    title: "Why welfare policy is complex",
    source: "Social Affairs Bulletin",
    content:
      "Welfare systems are complex because they must balance fairness, affordability, incentives to work, and support for vulnerable groups."
  },

];

const ITEMS_PER_PAGE = 10;
function App() {
  const [activeSection, setActiveSection] = useState("laws");
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
  const [generateMessage, setGenerateMessage] = useState("");

  const [questionInputs, setQuestionInputs] = useState({});
  const [questionAnswers, setQuestionAnswers] = useState({});
  const [loadingAskId, setLoadingAskId] = useState(null);

  const [biasResults, setBiasResults] = useState({});
  const [evaluatingBiasIds, setEvaluatingBiasIds] = useState({});
  

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
    activeSection === "laws"
      ? laws
      : items.filter((item) => item.type === "article");
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentItems = filteredItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  

  const handleSectionChange = (section) => {
    setActiveSection(section);
    setCurrentPage(1);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateMessage("");

    try {
      const res = await fetch("http://localhost:8000/generate", {
        method: "POST"
      });
      const json = await res.json();

      setGenerateMessage(
        json.message || "Generation finished."
      );
      await loadLaws();
      setActiveSection("laws");
      setCurrentPage(1);
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

//  const handleExplain = async (item) => {
//   const explanationKey = getExplanationKey(item.id);

//   if (explanations[explanationKey]) {
//     setExpandedExplanations((prev) => ({
//       ...prev,
//       [item.id]: true
//     }));
//     return;
//   }

//   setLoadingExplainId(item.id);
//   setExplainStartedAt(Date.now());

//   try {
//     const res = await fetch("http://localhost:8000/explain", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json"
//       },
//       body: JSON.stringify({
//         type: item.type,
//         title: item.title,
//         source: item.type === "law" ? item.creator : item.source,
//         content: item.type === "law" ? getLawDisplayContent(item) : item.content,
//         language: explanationLanguage
//       })
//     });

//     const json = await res.json();

//     setExplanations((prev) => ({
//       ...prev,
//       [explanationKey]: json
//     }));
//     setExpandedExplanations((prev) => ({
//       ...prev,
//       [item.id]: true
//     }));
//   } catch (error) {
//     console.error("Error fetching explanation:", error);
//   } finally {
//     setLoadingExplainId(null);
//     setExplainStartedAt(null);
//   }
// };

const handleExplain = async (item) => {
  const explanationKey = getExplanationKey(item.id);

  if (explanations[explanationKey]) {
    setExpandedExplanations((prev) => ({ ...prev, [item.id]: true }));
    return;
  }

  setLoadingExplainId(item.id);
  setExplainStartedAt(Date.now());

  try {
    const content = item.type === "law" ? getLawDisplayContent(item) : item.content;
    
    const res = await fetch("http://localhost:8000/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: item.type,
        title: item.title,
        source: item.type === "law" ? item.creator : item.source,
        content: content,
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
      const res = await fetch("http://localhost:8000/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: item.title,
          content: item.type === "law" ? getLawDisplayContent(item) : item.content,
          question: questionInputs[item.id] || ""
        })
      });

      const json = await res.json();

      setQuestionAnswers((prev) => ({
        ...prev,
        [item.id]: json.answer
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
        Read current topics, policies, and local rules, then get simple
        explanations.
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
            ...(activeSection === "articles" ? styles.menuButtonActive : {})
          }}
          onClick={() => handleSectionChange("articles")}
        >
          Articles
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
          {activeSection === "laws" ? "Laws and Policies" : "Articles"}
        </h2>
        <p style={styles.sectionDescription}>
          {activeSection === "laws"
            ? "Browse the predefined laws and policies available for explanation."
            : "Browse the predefined articles available for explanation."}
        </p>
      </div>

      <div style={styles.articleList}>
        {currentItems.length === 0 && (
          <div style={styles.emptyState}>
            No laws have been posted yet. Send data to the law endpoint and they
            will appear here.
          </div>
        )}

        {currentItems.map((item) => (
          (() => {
            const explanationKey = getExplanationKey(item.id);
            const explanation = explanations[explanationKey];
            const isExplanationExpanded = expandedExplanations[item.id];

            const biasResult = biasResults[explanationKey];
            const isEvaluatingBias = evaluatingBiasIds[item.id];

            return (
          <div key={item.id} style={styles.card}>
            <div style={styles.tagRow}>
              <span
                style={{
                  ...styles.typeTag,
                  backgroundColor:
                    item.type === "law" ? "#dcfce7" : "#e0e7ff",
                  color: item.type === "law" ? "#166534" : "#3730a3"
                }}
              >
                {item.type === "law" ? "Law / Policy" : "Article"}
              </span>
            </div>

            <h2 style={styles.articleTitle}>{item.title}</h2>
            {item.type === "law" ? (
              <>
                <p style={styles.metaText}>Creator: {item.creator}</p>
                <a href={item.url} target="_blank" rel="noreferrer" style={styles.urlLink}>
                  {item.url}
                </a>
              </>
            ) : (
              <p style={styles.source}>Source: {item.source}</p>
            )}

            <div style={styles.originalBox}>
              <h3 style={styles.sectionTitle}>
                {item.type === "law" ? "Original Law / Policy Data" : "Original Article"}
              </h3>
              {item.type === "law" ? (
                <div style={styles.scrollBox}>
                  <pre style={styles.codeBlock}>{getLawDisplayContent(item)}</pre>
                </div>
              ) : (
                <p style={styles.text}>{item.content}</p>
              )}
            </div>

            {item.type === "law" && (
              <button
                style={styles.deleteButton}
                onClick={() => handleDeleteLaw(item.id)}
                disabled={deletingLawId === item.id}
              >
                {deletingLawId === item.id ? "Deleting..." : "Delete"}
              </button>
            )}

            {!explanation || !isExplanationExpanded ? (
              <button
                style={styles.button}
                onClick={() => handleExplain(item)}
                disabled={loadingExplainId === item.id}
              >
                {loadingExplainId === item.id
                  ? "Loading..."
                  : explanation
                    ? "Show explanation"
                    : "Explain"}
              </button>
            ) : (
              <>
                <button
                  style={styles.hideButton}
                  onClick={() => handleHideExplanation(item.id)}
                >
                  Hide explanation
                </button>

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
  ) : item.type === "law" ? (
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
          {explanation.expected_impacts?.map((impact, i) => (
            <li key={i} style={styles.listItem}>
              {impact}
            </li>
          ))}
        </ul>
      </div>

      <div style={styles.block}>
        <p style={styles.heading}>Key Changes</p>
        <ul style={styles.list}>
          {explanation.key_changes?.map((change, i) => (
            <li key={i} style={styles.listItem}>
              {change}
            </li>
          ))}
        </ul>
      </div>

      <div style={styles.block}>
        <p style={styles.heading}>Trade-offs</p>
        <ul style={styles.list}>
          {explanation.trade_offs?.map((trade, i) => (
            <li key={i} style={styles.listItem}>
              {trade}
            </li>
          ))}
        </ul>
      </div>

      <div style={styles.block}>
        <p style={styles.heading}>Meaning for Resident</p>
        <p style={styles.contentText}>
          {explanation.meaning_for_resident}
        </p>
      </div>
    </>
  ) : (
    <>
      <div style={styles.block}>
        <p style={styles.heading}>Plain Answer</p>
        <p style={styles.contentText}>
          {explanation.plain_answer}
        </p>
      </div>

      <div style={styles.block}>
        <p style={styles.heading}>Why this happens</p>
        <ul style={styles.list}>
          {explanation.why_this_happens?.map((reason, i) => (
            <li key={i} style={styles.listItem}>
              {reason}
            </li>
          ))}
        </ul>
      </div>

      <div style={styles.block}>
        <p style={styles.heading}>Benefits</p>
        <ul style={styles.list}>
          {explanation.benefits?.map((benefit, i) => (
            <li key={i} style={styles.listItem}>
              {benefit}
            </li>
          ))}
        </ul>
      </div>

      <div style={styles.block}>
        <p style={styles.heading}>Downsides</p>
        <ul style={styles.list}>
          {explanation.downsides?.map((downside, i) => (
            <li key={i} style={styles.listItem}>
              {downside}
            </li>
          ))}
        </ul>
      </div>

      <div style={styles.block}>
        <p style={styles.heading}>Simple Example</p>
        <p style={styles.contentText}>
          {explanation.simple_example}
        </p>
      </div>
    </>
  )}
  {/* Bias Evaluation Display */}
<div style={{ ...styles.block, backgroundColor: "#f8fafc", padding: "12px", borderRadius: "8px" }}>
  <p style={styles.heading}>Bias Evaluation</p>
  {isEvaluatingBias ? (
  <p style={{ color: "#64748b", fontSize: "14px", fontStyle: "italic" }}>
    Evaluating response for bias...
  </p>
) : biasResult?.error ? (
  <p style={{ color: "#b91c1c", fontSize: "14px" }}>
    Failed to evaluate bias: {biasResult.error}
  </p>
) : biasResult ? (
    <>
      <div style={{ marginBottom: "8px", fontWeight: "bold", color: biasResult.score > 0.5 ? "#b91c1c" : "#15803d" }}>
        Score: {biasResult.score} {biasResult.score > 0.5 ? "(Detected Bias)" : "(Unbiased)"}
      </div>
      <p style={{ ...styles.contentText, fontSize: "14px" }}>
        <strong>Reasoning:</strong> {biasResult.reason || "No reasoning provided."}
      </p>
    </>
  ) : (
    <p style={{ color: "#64748b", fontSize: "14px" }}>Bias not evaluated.</p>
  )}
</div>
  <div style={styles.askBox}>
    <p style={styles.heading}>
      Ask anything about this {item.type === "law" ? "law" : "article"}
    </p>

    <textarea
      value={questionInputs[item.id] || ""}
      onChange={(e) => handleQuestionChange(item.id, e.target.value)}
      placeholder="Type your question here..."
      style={styles.textarea}
    />

    <button
      style={styles.sendButton}
      onClick={() => handleSendQuestion(item)}
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
                  This shows active processing while the model works. The
                  current local API does not expose a true completion
                  percentage for prompt processing.
                </p>
              </div>
            )}
          </div>
            );
          })()
        ))}
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
    minHeight: "100vh"
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
    gap: "25px"
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
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
  },
  tagRow: {
    marginBottom: "10px"
  },
  typeTag: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700"
  },
  articleTitle: {
    marginBottom: "8px",
    color: "#111827"
  },
  source: {
    color: "#374151",
    fontSize: "14px",
    marginBottom: "15px"
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
    marginBottom: "12px"
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
  text: {
    lineHeight: "1.7",
    color: "#1f2937"
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
    paddingLeft: "20px"
  },
  listItem: {
    color: "#1f2937",
    marginBottom: "6px",
    lineHeight: "1.6"
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
  deleteButton: {
    padding: "10px 16px",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    backgroundColor: "#b91c1c",
    color: "white",
    fontSize: "14px",
    marginRight: "10px"
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
    paddingBottom: "20px"
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
