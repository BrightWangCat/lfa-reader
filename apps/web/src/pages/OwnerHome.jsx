import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Button, Card, Tag, Typography, Skeleton } from "antd";
import { CameraOutlined, EnvironmentOutlined, RightOutlined } from "@ant-design/icons";
import { listImages } from "../services/api";
import { formatEasternDate } from "../utils/dateFormat";
import { getPlainResult } from "../utils/resultDisplay";
import { useAuth } from "../context/authStore";

const { Title, Text } = Typography;

const RECENT_LIMIT = 3;

const TONE_STYLES = {
  good: { color: "var(--result-good)", background: "var(--result-good-bg)" },
  attention: { color: "var(--result-bad)", background: "var(--result-bad-bg)" },
  invalid: {
    color: "var(--result-neutral)",
    background: "var(--result-neutral-bg)",
  },
  pending: {
    color: "var(--result-pending)",
    background: "var(--result-pending-bg)",
  },
  neutral: {
    color: "var(--result-neutral)",
    background: "var(--result-neutral-bg)",
  },
};

function ResultChip({ record }) {
  const final = record.manual_correction || record.cv_result;
  const plain = getPlainResult(record.disease_category, final);
  const style = TONE_STYLES[plain.tone] || TONE_STYLES.neutral;
  const label =
    plain.tone === "good"
      ? "Negative"
      : plain.tone === "attention"
        ? "Positive"
        : plain.tone === "pending"
          ? "Pending"
          : "Unreadable";
  return (
    <span
      style={{
        ...style,
        fontSize: 12,
        fontWeight: 700,
        borderRadius: 999,
        padding: "4px 11px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export default function OwnerHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recent, setRecent] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listImages()
      .then((res) => {
        if (!cancelled) setRecent(res.data.slice(0, RECENT_LIMIT));
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const applicationStatus = user?.doctor_application_status;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {applicationStatus === "pending" && (
        <Alert
          type="info"
          showIcon
          message="Your veterinarian account application is being reviewed by an administrator."
        />
      )}
      {applicationStatus === "rejected" && (
        <Alert
          type="warning"
          showIcon
          message="Your veterinarian account application was declined."
          description="You can keep using your regular account. Contact the administrator if you believe this is a mistake."
        />
      )}

      <Card
        style={{ background: "#F4E5D6", border: "none", borderRadius: 22 }}
        styles={{ body: { padding: "26px 24px" } }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.4,
            color: "#A06B3F",
          }}
        >
          HI {user?.username?.toUpperCase()}
        </Text>
        <Title
          level={2}
          style={{ margin: "6px 0 8px", color: "var(--ink-strong)" }}
        >
          Check a new test
        </Title>
        <Text
          style={{
            display: "block",
            color: "var(--ink-secondary)",
            maxWidth: 380,
            marginBottom: 18,
          }}
        >
          Take a photo of the test cassette and get a plain answer in about a
          minute.
        </Text>
        <Button
          type="primary"
          size="large"
          icon={<CameraOutlined />}
          shape="round"
          onClick={() => navigate("/start")}
        >
          Start a test
        </Button>
      </Card>

      <div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <Title level={4} style={{ margin: 0, color: "var(--ink-strong)" }}>
            Recent results
          </Title>
          <Link to="/history" style={{ fontWeight: 600, color: "#00897B" }}>
            All results
          </Link>
        </div>
        {recent === null ? (
          <Card>
            <Skeleton active paragraph={{ rows: 2 }} title={false} />
          </Card>
        ) : recent.length === 0 ? (
          <Card>
            <Text type="secondary">
              No tests yet. Your results will appear here after your first
              scan.
            </Text>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recent.map((record) => (
              <Card
                key={record.id}
                hoverable
                onClick={() => navigate(`/results?image=${record.id}`)}
                styles={{ body: { padding: "14px 16px" } }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5 }}>
                      {record.disease_category || "Test"}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12.5 }}>
                      {formatEasternDate(record.created_at)}
                    </Text>
                  </div>
                  <ResultChip record={record} />
                  <RightOutlined
                    style={{ color: "var(--ink-secondary)", fontSize: 12 }}
                  />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card
        hoverable
        onClick={() => navigate("/map")}
        styles={{ body: { padding: "16px 18px" } }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "var(--result-good-bg)",
              color: "#00897B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 19,
            }}
          >
            <EnvironmentOutlined />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>
              Around Columbus
            </div>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              Positive cases reported near you, updated from anonymized
              community results
            </Text>
          </div>
          <Tag color="default">Map</Tag>
        </div>
      </Card>
    </div>
  );
}
