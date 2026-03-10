import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Row,
  Col,
  Card,
  Tag,
  Button,
  Select,
  Space,
  Alert,
  Progress,
  Spin,
  Collapse,
  Typography,
  App,
  Grid,
  Dropdown,
} from "antd";
import {
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  RobotOutlined,
  CheckOutlined,
  DownloadOutlined,
  BarChartOutlined,
  PlusOutlined,
  SyncOutlined,
  StopOutlined,
  FileExcelOutlined,
  ExperimentOutlined,
  FileImageOutlined,
  EllipsisOutlined,
} from "@ant-design/icons";
import api, { API_BASE_URL } from "../services/api";
import { useAuth } from "../context/AuthContext";

const { useBreakpoint } = Grid;

const { Title, Text } = Typography;

const PATIENT_FIELDS = [
  { key: "species", label: "Species" },
  { key: "age", label: "Age" },
  { key: "sex", label: "Sex" },
  { key: "breed", label: "Breed" },
  { key: "zip_code", label: "Zip Code" },
];

const CATEGORIES = [
  "Negative",
  "Positive L",
  "Positive I",
  "Positive L+I",
  "Invalid",
];

export default function Results() {
  const [searchParams] = useSearchParams();
  const batchId = searchParams.get("batch");
  const { message } = App.useApp();
  const { user } = useAuth();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [correctionValue, setCorrectionValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Classification state
  const [classifyStatus, setClassifyStatus] = useState(null);
  const [classifyProgress, setClassifyProgress] = useState(0);
  const [classifyError, setClassifyError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedModel, setSelectedModel] = useState("claude-sonnet-4-6");
  const [activeMethod, setActiveMethod] = useState(null); // "cv" or "llm"

  // Per-image toggle: show original instead of preprocessed
  const [showOriginal, setShowOriginal] = useState({});

  useEffect(() => {
    if (!batchId) {
      setError("No batch specified");
      setLoading(false);
      return;
    }
    fetchBatch();
  }, [batchId]);

  // Initialize classify status from batch data
  useEffect(() => {
    if (batch) {
      setClassifyStatus(batch.reading_status || null);
    }
  }, [batch]);

  // Poll status when queued or running (5-second interval)
  useEffect(() => {
    if (classifyStatus !== "queued" && classifyStatus !== "running") return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/api/readings/batch/${batchId}/status`);
        setClassifyStatus(res.data.reading_status);
        setClassifyProgress(res.data.progress);
        setClassifyError(res.data.reading_error || "");
        if (res.data.claude_model) {
          setActiveMethod(res.data.claude_model === "cv" ? "cv" : "llm");
        }

        if (res.data.reading_status === "completed") {
          clearInterval(interval);
          fetchBatch();
        } else if (res.data.reading_status === "failed") {
          clearInterval(interval);
        }
      } catch (err) {
        console.error("Status poll failed:", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [classifyStatus, batchId]);

  const fetchBatch = async () => {
    try {
      const res = await api.get(`/api/upload/batch/${batchId}`);
      setBatch(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load batch");
    } finally {
      setLoading(false);
    }
  };

  const getImageUrl = (imageId, original = false) => {
    const token = localStorage.getItem("token");
    const base = `${API_BASE_URL}/api/upload/image/${imageId}?token=${token}`;
    return original ? `${base}&original=true` : base;
  };

  const toggleOriginal = (imageId) => {
    setShowOriginal((prev) => ({ ...prev, [imageId]: !prev[imageId] }));
  };

  const startEdit = (image) => {
    setEditingId(image.id);
    setCorrectionValue(
      image.manual_correction || image.reading_result || ""
    );
  };

  const cancelEdit = () => {
    setEditingId(null);
    setCorrectionValue("");
  };

  const saveCorrection = async (imageId) => {
    setSaving(true);
    try {
      await api.put(`/api/readings/image/${imageId}/correct`, {
        manual_correction: correctionValue,
      });
      setBatch((prev) => ({
        ...prev,
        images: prev.images.map((img) =>
          img.id === imageId
            ? { ...img, manual_correction: correctionValue }
            : img
        ),
      }));
      setEditingId(null);
    } catch (err) {
      message.error(
        err.response?.data?.detail || "Failed to save correction"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCVClassify = async () => {
    setSubmitting(true);
    setClassifyError("");
    try {
      const res = await api.post(`/api/readings/batch/${batchId}/classify`, {
        method: "cv",
      });
      setClassifyStatus(res.data.reading_status);
      setClassifyProgress(0);
      setActiveMethod("cv");
    } catch (err) {
      setClassifyError(
        err.response?.data?.detail || "Failed to submit CV classification"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleClassify = async () => {
    setSubmitting(true);
    setClassifyError("");
    try {
      const res = await api.post(`/api/readings/batch/${batchId}/classify`, {
        method: "llm",
        model: selectedModel,
      });
      setClassifyStatus(res.data.reading_status);
      setClassifyProgress(0);
      setActiveMethod("llm");
    } catch (err) {
      setClassifyError(
        err.response?.data?.detail || "Failed to submit AI classification"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    try {
      await api.post(`/api/readings/batch/${batchId}/cancel`);
      setClassifyStatus(null);
      setClassifyProgress(0);
      setClassifyError("");
    } catch (err) {
      message.error(err.response?.data?.detail || "Failed to cancel");
    }
  };

  // 快捷批准：将 AI 或 CV 结果直接设为手动修正值
  const approveResult = async (imageId, value) => {
    setSaving(true);
    try {
      await api.put(`/api/readings/image/${imageId}/correct`, {
        manual_correction: value,
      });
      setBatch((prev) => ({
        ...prev,
        images: prev.images.map((img) =>
          img.id === imageId
            ? { ...img, manual_correction: value }
            : img
        ),
      }));
      message.success("Correction saved");
    } catch (err) {
      message.error(
        err.response?.data?.detail || "Failed to save correction"
      );
    } finally {
      setSaving(false);
    }
  };

  const renderAiTag = (image) => {
    if (image.reading_result) {
      return <Tag color="blue">{image.reading_result}</Tag>;
    }
    return <Tag color="gold">Pending</Tag>;
  };

  const renderCvTag = (image) => {
    if (image.cv_result) {
      return <Tag color="green">{image.cv_result}</Tag>;
    }
    return <Tag color="gold">Pending</Tag>;
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "4rem" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: "center", padding: "4rem" }}>
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ maxWidth: 400, margin: "0 auto 16px" }}
        />
        <Link to="/upload">
          <Button type="primary">Go to Upload</Button>
        </Link>
      </div>
    );
  }

  const isSingle = batch?.total_images === 1;

  // Determine the AI action button label
  const aiButtonLabel = submitting
    ? "Submitting..."
    : classifyStatus === "completed"
      ? "Re-run AI"
      : classifyStatus === "failed"
        ? "Retry AI"
        : "Run AI Classification";

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <Title level={3} style={{ color: "#1a365d", margin: 0 }}>
            {isSingle ? "Classification Result" : "Batch Results"}
          </Title>
          <Text type="secondary">
            {batch.name && (
              <Text strong style={{ marginRight: 8 }}>
                {batch.name}
              </Text>
            )}
            {batch.total_images} image
            {batch.total_images !== 1 ? "s" : ""} {" \u00b7 "}
            Uploaded {new Date(batch.created_at).toLocaleString()}
          </Text>
        </div>
        <Space wrap size={isMobile ? "small" : "middle"}>
          {classifyStatus === null ||
          classifyStatus === "completed" ||
          classifyStatus === "failed" ? (
            <>
              <Button
                icon={<ExperimentOutlined />}
                style={{
                  background: "#276749",
                  borderColor: "#276749",
                  color: "#fff",
                }}
                size={isMobile ? "small" : "middle"}
                loading={submitting}
                onClick={handleCVClassify}
              >
                Run CV
              </Button>
              {!isMobile && (
                <Select
                  value={selectedModel}
                  onChange={setSelectedModel}
                  style={{ width: 200 }}
                  options={[
                    { value: "claude-sonnet-4-6", label: "Sonnet 4.6 (Default)" },
                    { value: "claude-opus-4-6", label: "Opus 4.6 (Premium)" },
                  ]}
                />
              )}
              <Button
                icon={<RobotOutlined />}
                style={{
                  background: "#dd6b20",
                  borderColor: "#dd6b20",
                  color: "#fff",
                }}
                size={isMobile ? "small" : "middle"}
                loading={submitting}
                onClick={handleClassify}
              >
                {isMobile ? "Run AI" : aiButtonLabel}
              </Button>
            </>
          ) : (
            <Button
              danger
              icon={<StopOutlined />}
              onClick={handleCancel}
            >
              Cancel Job
            </Button>
          )}
          {!isSingle && isMobile ? (
            <Dropdown
              menu={{
                items: [
                  {
                    key: "csv",
                    icon: <DownloadOutlined />,
                    label: (
                      <a href={`${API_BASE_URL}/api/export/batch/${batchId}/csv?token=${localStorage.getItem("token")}`}>
                        Export CSV
                      </a>
                    ),
                  },
                  {
                    key: "excel",
                    icon: <FileExcelOutlined />,
                    label: (
                      <a href={`${API_BASE_URL}/api/export/batch/${batchId}/excel?token=${localStorage.getItem("token")}`}>
                        Export Excel
                      </a>
                    ),
                  },
                  ...(user?.role === "admin"
                    ? [
                        {
                          key: "images",
                          icon: <FileImageOutlined />,
                          label: (
                            <a href={`${API_BASE_URL}/api/export/batch/${batchId}/images?token=${localStorage.getItem("token")}`}>
                              Export Images
                            </a>
                          ),
                        },
                      ]
                    : []),
                  {
                    key: "stats",
                    icon: <BarChartOutlined />,
                    label: <Link to={`/stats?batch=${batchId}`}>View Statistics</Link>,
                  },
                ],
              }}
              placement="bottomRight"
            >
              <Button icon={<EllipsisOutlined />} size="small">More</Button>
            </Dropdown>
          ) : !isSingle ? (
            <>
              <Button
                icon={<DownloadOutlined />}
                href={`${API_BASE_URL}/api/export/batch/${batchId}/csv?token=${localStorage.getItem("token")}`}
                style={{ background: "#718096", borderColor: "#718096", color: "#fff" }}
              >
                Export CSV
              </Button>
              <Button
                icon={<FileExcelOutlined />}
                href={`${API_BASE_URL}/api/export/batch/${batchId}/excel?token=${localStorage.getItem("token")}`}
                style={{ background: "#276749", borderColor: "#276749", color: "#fff" }}
              >
                Export Excel
              </Button>
              {user?.role === "admin" && (
                <Button
                  icon={<FileImageOutlined />}
                  href={`${API_BASE_URL}/api/export/batch/${batchId}/images?token=${localStorage.getItem("token")}`}
                  style={{ background: "#2b6cb0", borderColor: "#2b6cb0", color: "#fff" }}
                >
                  Export Images
                </Button>
              )}
              <Link to={`/stats?batch=${batchId}`}>
                <Button icon={<BarChartOutlined />}>View Statistics</Button>
              </Link>
            </>
          ) : null}
          <Link to="/upload">
            <Button icon={<PlusOutlined />} size={isMobile ? "small" : "middle"}>
              New Test
            </Button>
          </Link>
        </Space>
      </div>

      {/* Classification status banner */}
      {classifyStatus === "running" && (
        <Alert
          type="warning"
          showIcon
          icon={<SyncOutlined spin />}
          message={`${activeMethod === "cv" ? "CV classification" : "AI classification (Claude API)"}... ${classifyProgress.toFixed(0)}%`}
          description={
            <Progress
              percent={parseFloat(classifyProgress.toFixed(0))}
              strokeColor="#d69e2e"
              size="small"
              style={{ marginTop: 8 }}
            />
          }
          style={{ marginBottom: 24 }}
        />
      )}

      {classifyError && (
        <Alert
          type="error"
          message={`Classification failed: ${classifyError}`}
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Image grid */}
      <Row gutter={[20, 20]}>
        {batch.images.map((image) => (
          <Col key={image.id} xs={24} sm={12} md={8} lg={6}>
            <Card
              cover={
                <div
                  style={{
                    aspectRatio: image.is_preprocessed && !showOriginal[image.id] ? "2 / 1" : "3 / 4",
                    background: "#f7fafc",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <img
                    src={getImageUrl(image.id, showOriginal[image.id])}
                    alt={image.original_filename}
                    loading="lazy"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                    }}
                  />
                  {image.is_preprocessed && (
                    <Button
                      type="text"
                      size="small"
                      onClick={() => toggleOriginal(image.id)}
                      style={{
                        position: "absolute",
                        bottom: 4,
                        right: 4,
                        fontSize: 11,
                        color: "#718096",
                        background: "rgba(255,255,255,0.85)",
                        padding: "2px 8px",
                        height: "auto",
                        lineHeight: "18px",
                      }}
                    >
                      {showOriginal[image.id] ? "Show Processed" : "Show Original"}
                    </Button>
                  )}
                </div>
              }
              styles={{ body: { padding: 16 } }}
            >
              <Text
                type="secondary"
                ellipsis
                style={{
                  display: "block",
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                {image.original_filename}
              </Text>

              {/* AI Reading */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
                <Text type="secondary" style={{ fontSize: 14 }}>
                  AI Reading:
                </Text>
                {renderAiTag(image)}
              </div>

              {/* CV Reading */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Text type="secondary" style={{ fontSize: 14 }}>
                  CV Reading:
                </Text>
                {renderCvTag(image)}
              </div>

              {/* Manual correction */}
              {image.manual_correction && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 14 }}>
                    Corrected:
                  </Text>
                  <Tag color="green">{image.manual_correction}</Tag>
                </div>
              )}

              {/* Patient Info (collapsible) */}
              {image.patient_info && (
                <Collapse
                  ghost
                  size="small"
                  items={[
                    {
                      key: "patient",
                      label: (
                        <Text strong style={{ fontSize: 13 }}>
                          Patient Info
                        </Text>
                      ),
                      children: (
                        <div>
                          {PATIENT_FIELDS.map(
                            ({ key, label }) =>
                              image.patient_info[key] && (
                                <div
                                  key={key}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    padding: "4px 0",
                                    fontSize: 13,
                                  }}
                                >
                                  <Text type="secondary">{label}:</Text>
                                  <Text strong>
                                    {image.patient_info[key]}
                                  </Text>
                                </div>
                              )
                          )}
                        </div>
                      ),
                    },
                  ]}
                  style={{ marginTop: 4, marginBottom: 4 }}
                />
              )}

              {/* Inline editing */}
              {editingId === image.id ? (
                <div style={{ marginTop: 8 }}>
                  <Select
                    value={correctionValue || undefined}
                    onChange={setCorrectionValue}
                    placeholder="Select category"
                    options={CATEGORIES.map((cat) => ({
                      value: cat,
                      label: cat,
                    }))}
                    style={{ width: "100%", marginBottom: 8 }}
                  />
                  <Space style={{ width: "100%" }}>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={saving}
                      disabled={!correctionValue}
                      onClick={() => saveCorrection(image.id)}
                      block
                    >
                      Save
                    </Button>
                    <Button
                      icon={<CloseOutlined />}
                      disabled={saving}
                      onClick={cancelEdit}
                      block
                    >
                      Cancel
                    </Button>
                  </Space>
                </div>
              ) : (
                <>
                  <Button
                    block
                    icon={<EditOutlined />}
                    onClick={() => startEdit(image)}
                    style={{ marginTop: 8 }}
                  >
                    {image.manual_correction
                      ? "Edit Correction"
                      : "Manual Correct"}
                  </Button>
                  <Space style={{ width: "100%", marginTop: 6 }}>
                    {image.reading_result && (
                      <Button
                        block
                        size="small"
                        icon={<CheckOutlined />}
                        loading={saving}
                        onClick={() => approveResult(image.id, image.reading_result)}
                        style={{
                          background: "#2b6cb0",
                          borderColor: "#2b6cb0",
                          color: "#fff",
                          fontSize: 12,
                        }}
                      >
                        Approve AI
                      </Button>
                    )}
                    {image.cv_result && (
                      <Button
                        block
                        size="small"
                        icon={<CheckOutlined />}
                        loading={saving}
                        onClick={() => approveResult(image.id, image.cv_result)}
                        style={{
                          background: "#276749",
                          borderColor: "#276749",
                          color: "#fff",
                          fontSize: 12,
                        }}
                      >
                        Approve CV
                      </Button>
                    )}
                  </Space>
                </>
              )}
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
