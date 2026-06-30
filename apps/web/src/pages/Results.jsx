import { useCallback, useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Card,
  Tag,
  Button,
  Select,
  Space,
  Alert,
  Spin,
  Collapse,
  Typography,
  App,
  Grid,
  Descriptions,
} from "antd";
import {
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  CheckOutlined,
  PlusOutlined,
  SyncOutlined,
  StopOutlined,
  ExperimentOutlined,
  ArrowLeftOutlined,
  ExclamationCircleFilled,
} from "@ant-design/icons";
import {
  getImage,
  classifyImage,
  getClassifyStatus,
  cancelClassify,
  correctReading,
  buildImageFileUrl,
} from "../services/api";
import { resolveWarning } from "../locales/warnings";
import { formatEasternDateTime } from "../utils/dateFormat";

const { useBreakpoint } = Grid;
const { Title, Text } = Typography;

const formatPreventive = (v) =>
  v === true ? "Yes" : v === false ? "No" : null;

const PATIENT_FIELDS = [
  { key: "disease_category", label: "Disease" },
  { key: "species", label: "Species" },
  { key: "age", label: "Age" },
  { key: "sex", label: "Sex" },
  { key: "breed", label: "Breed" },
  {
    key: "preventive_treatment",
    label: "Preventive Treatment (6mo)",
    format: formatPreventive,
  },
  { key: "area_code", label: "Area Code" },
];

const CATEGORIES = [
  "Negative",
  "Positive L",
  "Positive I",
  "Positive L+I",
  "Invalid",
];

const TICK_BORNE_ANALYTES = [
  ["ehrlichia", "E. canis/E. ewingii Ab"],
  ["lyme", "Lyme disease Ab (B. burgdorferi)"],
  ["anaplasma", "A. phagocytophilum/A. platys Ab"],
  ["heartworm", "Heartworm Ag"],
];

const buildTickBorneCorrectionOptions = () => {
  const options = [{ value: "Negative", label: "Negative" }];
  const count = TICK_BORNE_ANALYTES.length;
  for (let mask = 1; mask < (1 << count); mask += 1) {
    const labels = TICK_BORNE_ANALYTES
      .filter((_, index) => mask & (1 << index))
      .map(([, label]) => label);
    const value = `Positive: ${labels.join(", ")}`;
    options.push({ value, label: value });
  }
  options.push({ value: "Invalid", label: "Invalid" });
  return options;
};

const correctionOptionsForImage = (image) => {
  if (image?.disease_category === "Tick Borne") {
    return buildTickBorneCorrectionOptions();
  }
  return CATEGORIES.map((cat) => ({ value: cat, label: cat }));
};

const detailForImage = (image) =>
  image?.manual_correction_detail || image?.cv_result_detail || null;

const analyteRowsForImage = (image) => {
  const detail = detailForImage(image);
  if (!detail?.analytes) return [];
  return TICK_BORNE_ANALYTES
    .filter(([key]) => Object.prototype.hasOwnProperty.call(detail.analytes, key))
    .map(([key, label]) => [label, detail.analytes[key]]);
};

export default function Results() {
  const [searchParams] = useSearchParams();
  const imageId = searchParams.get("image");
  const { message } = App.useApp();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [correctionValue, setCorrectionValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Classification state
  const [classifyStatus, setClassifyStatus] = useState(null);
  const [classifyError, setClassifyError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [showOriginal, setShowOriginal] = useState(false);

  const fetchImage = useCallback(async () => {
    try {
      const res = await getImage(imageId);
      setImage(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load image");
    } finally {
      setLoading(false);
    }
  }, [imageId]);

  useEffect(() => {
    if (!imageId) {
      setError("No image specified");
      setLoading(false);
      return;
    }
    fetchImage();
  }, [imageId, fetchImage]);

  useEffect(() => {
    if (image) {
      setClassifyStatus(image.reading_status || null);
    }
  }, [image]);

  // Poll status while running
  useEffect(() => {
    if (classifyStatus !== "running") return;

    const interval = setInterval(async () => {
      try {
        const res = await getClassifyStatus(imageId);
        setClassifyStatus(res.data.reading_status);
        setClassifyError(res.data.reading_error || "");

        if (
          res.data.reading_status === "completed" ||
          res.data.reading_status === "failed"
        ) {
          clearInterval(interval);
          fetchImage();
        }
      } catch (err) {
        console.error("Status poll failed:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [classifyStatus, imageId, fetchImage]);

  const startEdit = () => {
    setEditing(true);
    setCorrectionValue(image.manual_correction || image.cv_result || "");
  };

  const cancelEdit = () => {
    setEditing(false);
    setCorrectionValue("");
  };

  const saveCorrection = async () => {
    setSaving(true);
    try {
      await correctReading(imageId, correctionValue);
      setImage((prev) => ({ ...prev, manual_correction: correctionValue }));
      setEditing(false);
    } catch (err) {
      message.error(err.response?.data?.detail || "Failed to save correction");
    } finally {
      setSaving(false);
    }
  };

  const handleCVClassify = async () => {
    setSubmitting(true);
    setClassifyError("");
    try {
      const res = await classifyImage(imageId);
      setClassifyStatus(res.data.reading_status);
    } catch (err) {
      setClassifyError(
        err.response?.data?.detail || "Failed to submit CV classification"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelClassify(imageId);
      setClassifyStatus(null);
      setClassifyError("");
    } catch (err) {
      message.error(err.response?.data?.detail || "Failed to cancel");
    }
  };

  const approveResult = async () => {
    if (!image?.cv_result) return;
    setSaving(true);
    try {
      await correctReading(imageId, image.cv_result);
      setImage((prev) => ({ ...prev, manual_correction: prev.cv_result }));
      message.success("Correction saved");
    } catch (err) {
      message.error(err.response?.data?.detail || "Failed to save correction");
    } finally {
      setSaving(false);
    }
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
        <Link to="/">
          <Button type="primary">Go to Home</Button>
        </Link>
      </div>
    );
  }

  const classificationButtonLabel = submitting
    ? "Submitting..."
    : classifyStatus === "completed"
      ? "Re-run Classification"
      : classifyStatus === "failed"
        ? "Retry Classification"
        : "Run Classification";

  const isRunning = classifyStatus === "running";

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div
        style={{
          marginBottom: 24,
        }}
      >
        <div>
          <Title level={3} style={{ color: "#1a365d", margin: 0 }}>
            Classification Result
          </Title>
          <Text type="secondary">
            Image #{image.id} {" \u00b7 "}
            Uploaded {formatEasternDateTime(image.created_at)}
          </Text>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 16,
          }}
        >
          <Link to="/history">
            <Button icon={<ArrowLeftOutlined />} size={isMobile ? "small" : "middle"}>
              History
            </Button>
          </Link>
          <Space wrap size={isMobile ? "small" : "middle"}>
            {!isRunning ? (
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
                {classificationButtonLabel}
              </Button>
            ) : (
              <Button danger icon={<StopOutlined />} onClick={handleCancel}>
                Cancel Job
              </Button>
            )}
            <Link to="/">
              <Button
                icon={<PlusOutlined />}
                type="primary"
                size={isMobile ? "small" : "middle"}
              >
                New Test
              </Button>
            </Link>
          </Space>
        </div>
      </div>

      {isRunning && (
        <Alert
          type="warning"
          showIcon
          icon={<SyncOutlined spin />}
          message="CV classification running..."
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

      {image.warnings && image.warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<ExclamationCircleFilled style={{ color: "#8e6a00" }} />}
          message={<span style={{ color: "#684e00", fontWeight: 600 }}>Advisory</span>}
          description={
            <ul style={{ margin: 0, paddingLeft: 20, color: "#684e00" }}>
              {image.warnings.map((key) => (
                <li key={key}>{resolveWarning(key)}</li>
              ))}
            </ul>
          }
          style={{
            marginBottom: 24,
            background: "#fcf4d6",
            border: "1px solid #d2a106",
          }}
        />
      )}

      <Card styles={{ body: { padding: 16 } }}>
        <div
          style={{
            aspectRatio: image.is_preprocessed && !showOriginal ? "2 / 1" : "3 / 4",
            background: "#f7fafc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            position: "relative",
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <img
            src={buildImageFileUrl(image.id, showOriginal)}
            alt={image.original_filename}
            loading="lazy"
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
          {image.is_preprocessed && (
            <Button
              type="text"
              size="small"
              onClick={() => setShowOriginal((v) => !v)}
              style={{
                position: "absolute",
                bottom: 8,
                right: 8,
                fontSize: 12,
                color: "#718096",
                background: "rgba(255,255,255,0.85)",
                padding: "2px 10px",
                height: "auto",
                lineHeight: "20px",
              }}
            >
              {showOriginal ? "Show Processed" : "Show Original"}
            </Button>
          )}
        </div>

        <Text type="secondary" ellipsis style={{ display: "block", fontSize: 13, marginBottom: 16 }}>
          {image.original_filename}
        </Text>

        <Descriptions
          column={1}
          size="small"
          style={{ marginBottom: 16 }}
          items={[
            {
              key: "cv",
              label: "CV Reading",
              children: image.cv_result ? (
                <Tag color="green">{image.cv_result}</Tag>
              ) : (
                <Tag color="gold">Pending</Tag>
              ),
            },
            ...(image.manual_correction
              ? [
                  {
                    key: "manual",
                    label: "Corrected",
                    children: <Tag color="green">{image.manual_correction}</Tag>,
                  },
                ]
              : []),
          ]}
        />

        {analyteRowsForImage(image).length > 0 && (
          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              background: "#fbfdff",
            }}
          >
            <Text strong style={{ display: "block", marginBottom: 8, fontSize: 13 }}>
              Tick Borne Panel
            </Text>
            {analyteRowsForImage(image).map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "4px 0",
                  fontSize: 13,
                }}
              >
                <Text type="secondary">{label}</Text>
                <Tag color={value === "Positive" ? "red" : "green"}>{value}</Tag>
              </div>
            ))}
          </div>
        )}

        {image.patient_info && (
          <Collapse
            ghost
            size="small"
            items={[
              {
                key: "patient",
                label: <Text strong style={{ fontSize: 13 }}>Patient Info</Text>,
                children: (
                  <div>
                    {PATIENT_FIELDS.map(({ key, label, format }) => {
                      const raw = image.patient_info[key];
                      const value = format ? format(raw) : raw;
                      if (value === null || value === undefined || value === "") return null;
                      return (
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
                          <Text strong>{value}</Text>
                        </div>
                      );
                    })}
                  </div>
                ),
              },
            ]}
            style={{ marginBottom: 16 }}
          />
        )}

        {editing ? (
          <div style={{ marginTop: 8 }}>
            <Select
              value={correctionValue || undefined}
              onChange={setCorrectionValue}
              placeholder="Select category"
              options={correctionOptionsForImage(image)}
              style={{ width: "100%", marginBottom: 8 }}
            />
            <Space style={{ width: "100%" }}>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving}
                disabled={!correctionValue}
                onClick={saveCorrection}
                block
              >
                Save
              </Button>
              <Button icon={<CloseOutlined />} disabled={saving} onClick={cancelEdit} block>
                Cancel
              </Button>
            </Space>
          </div>
        ) : (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Button block icon={<EditOutlined />} onClick={startEdit}>
              {image.manual_correction ? "Edit Correction" : "Manual Correct"}
            </Button>
            {image.cv_result && !image.manual_correction && (
              <Button
                block
                icon={<CheckOutlined />}
                loading={saving}
                onClick={approveResult}
                style={{
                  background: "#276749",
                  borderColor: "#276749",
                  color: "#fff",
                }}
              >
                Approve CV Result
              </Button>
            )}
          </Space>
        )}
      </Card>
    </div>
  );
}
