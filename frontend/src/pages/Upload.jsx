import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Typography,
  Card,
  Row,
  Col,
  Button,
  Input,
  Upload,
  Steps,
  Progress,
  Alert,
  Radio,
  Select,
  Form,
  Result,
  Space,
  App,
} from "antd";
import {
  FileImageOutlined,
  CopyOutlined,
  ArrowLeftOutlined,
  InboxOutlined,
  UploadOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import api from "../services/api";
import { uploadSingle } from "../services/api";
import { useAuth } from "../context/AuthContext";

const { Title, Text } = Typography;
const { Dragger } = Upload;

const ALLOWED_TYPES = ["image/jpeg", "image/png"];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

/* ------------------------------------------------------------------ */
/*  Batch Upload                                                       */
/* ------------------------------------------------------------------ */
function BatchUpload() {
  const [fileList, setFileList] = useState([]);
  const [batchName, setBatchName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { message } = App.useApp();

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Validate a single file before adding to list
  const beforeUpload = (file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      message.error(`${file.name}: unsupported format. Only JPG/PNG allowed.`);
      return Upload.LIST_IGNORE;
    }
    if (file.size > MAX_SIZE) {
      message.error(`${file.name}: exceeds 20MB limit.`);
      return Upload.LIST_IGNORE;
    }
    return false; // Prevent auto-upload, add to fileList only
  };

  // Handle fileList changes with unique filename deduplication
  const handleChange = useCallback(({ fileList: newFileList }) => {
    const seen = new Set();
    const deduped = newFileList.filter((f) => {
      const name = f.name || f.originFileObj?.name;
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
    setFileList(deduped);
  }, []);

  const handleUpload = async () => {
    if (fileList.length === 0) return;
    setError("");
    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    // Extract native File objects from Ant Design fileList items
    fileList.forEach((f) => formData.append("files", f.originFileObj));
    if (batchName.trim()) {
      formData.append("batch_name", batchName.trim());
    }

    try {
      const res = await api.post("/api/upload/batch", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        },
      });
      navigate(`/results?batch=${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <Text strong style={{ display: "block", marginBottom: 6 }}>
          Batch Name (optional)
        </Text>
        <Input
          value={batchName}
          onChange={(e) => setBatchName(e.target.value)}
          placeholder="e.g. Clinic A - Feb 2026"
          disabled={uploading}
          size="large"
        />
      </div>

      <Dragger
        multiple
        accept=".jpg,.jpeg,.png"
        fileList={fileList}
        beforeUpload={beforeUpload}
        onChange={handleChange}
        onRemove={(file) => {
          setFileList((prev) => prev.filter((f) => f.uid !== file.uid));
        }}
        showUploadList={{
          showPreviewIcon: false,
          showRemoveIcon: !uploading,
          extra: ({ size }) => (
            <Text type="secondary" style={{ fontSize: 12 }}>
              ({formatSize(size)})
            </Text>
          ),
        }}
        disabled={uploading}
        style={{ marginBottom: 16 }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">
          Drag and drop images here, or click to select
        </p>
        <p className="ant-upload-hint">
          Supported: JPG, PNG. Max 20MB per file.
        </p>
      </Dragger>

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          onClose={() => setError("")}
          style={{ marginBottom: 16 }}
        />
      )}

      {fileList.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <Text>
            {fileList.length} file{fileList.length > 1 ? "s" : ""} selected
          </Text>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => setFileList([])}
            disabled={uploading}
          >
            Clear all
          </Button>
        </div>
      )}

      {uploading && (
        <Progress
          percent={progress}
          status="active"
          style={{ marginBottom: 16 }}
        />
      )}

      <Button
        type="primary"
        block
        size="large"
        icon={<UploadOutlined />}
        loading={uploading}
        disabled={fileList.length === 0}
        onClick={handleUpload}
      >
        {uploading
          ? "Uploading..."
          : `Upload ${fileList.length} image${fileList.length !== 1 ? "s" : ""}`}
      </Button>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Single Upload (multi-step flow)                                    */
/* ------------------------------------------------------------------ */
function SingleUpload() {
  const navigate = useNavigate();
  const { message } = App.useApp();

  // Step state
  const [step, setStep] = useState(0); // 0-indexed for Steps component

  // Step 1 - file
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);

  // Step 2 - patient info
  const [shareInfo, setShareInfo] = useState(null); // null = not chosen, true/false
  const [species, setSpecies] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [breed, setBreed] = useState("");
  const [zipCode, setZipCode] = useState("");

  // Submission
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const selectFile = (f) => {
    if (!ALLOWED_TYPES.includes(f.type)) {
      message.error(
        `${f.name}: unsupported format. Only JPG/PNG allowed.`
      );
      return;
    }
    if (f.size > MAX_SIZE) {
      message.error(`${f.name}: exceeds 20MB limit.`);
      return;
    }
    setError("");
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setError("");
    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("share_info", shareInfo ? "true" : "false");

    if (shareInfo) {
      if (species) formData.append("species", species);
      if (age) formData.append("age", age);
      if (sex) formData.append("sex", sex);
      if (breed) formData.append("breed", breed);
      if (zipCode) formData.append("zip_code", zipCode);
    }

    try {
      const res = await uploadSingle(formData, (e) => {
        if (e.total) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // Success screen
  if (result) {
    return (
      <Result
        status="success"
        title="Upload Successful"
        subTitle={
          <>
            <div>Batch ID: {result.batch_id}</div>
            <div>Image ID: {result.image_id}</div>
            {result.patient_info && <div>Patient info saved.</div>}
          </>
        }
        extra={[
          <Button
            type="primary"
            key="view"
            onClick={() => navigate(`/results?batch=${result.batch_id}`)}
          >
            View Results
          </Button>,
        ]}
      />
    );
  }

  return (
    <>
      <Steps
        current={step}
        items={[
          { title: "Image" },
          { title: "Patient Info" },
          { title: "GPS & Submit" },
        ]}
        style={{ marginBottom: 32 }}
      />

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          onClose={() => setError("")}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Step 1: Select Image */}
      {step === 0 && (
        <>
          <Dragger
            accept=".jpg,.jpeg,.png"
            maxCount={1}
            showUploadList={false}
            beforeUpload={(f) => {
              selectFile(f);
              return false; // Prevent auto-upload
            }}
            style={{ marginBottom: 16 }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">
              Drag and drop an image here, or click to select
            </p>
            <p className="ant-upload-hint">
              Supported: JPG, PNG. Max 20MB.
            </p>
          </Dragger>

          {preview && (
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <img
                src={preview}
                alt="Preview"
                style={{
                  maxWidth: "100%",
                  maxHeight: 300,
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  objectFit: "contain",
                }}
              />
              <Text
                type="secondary"
                style={{ display: "block", marginTop: 8, fontSize: 13 }}
              >
                {file.name}
              </Text>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 24,
            }}
          >
            <Button
              type="primary"
              size="large"
              disabled={!file}
              onClick={() => setStep(1)}
            >
              Next
            </Button>
          </div>
        </>
      )}

      {/* Step 2: Patient Information */}
      {step === 1 && (
        <>
          <Title level={5} style={{ color: "#1a365d", marginBottom: 16 }}>
            Would you like to share some confidential information regarding the
            patient?
          </Title>

          <Radio.Group
            value={shareInfo}
            onChange={(e) => setShareInfo(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            size="large"
            style={{ marginBottom: 20 }}
          >
            <Radio.Button value={true}>Yes</Radio.Button>
            <Radio.Button value={false}>No</Radio.Button>
          </Radio.Group>

          {shareInfo && (
            <Form layout="vertical" style={{ marginBottom: 8 }}>
              <Form.Item label="Species">
                <Select
                  value={species || undefined}
                  onChange={setSpecies}
                  placeholder="Select species"
                  options={[
                    { value: "Dog", label: "Dog" },
                    { value: "Cat", label: "Cat" },
                  ]}
                  allowClear
                />
              </Form.Item>
              <Form.Item label="Age">
                <Input
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g. 3 years, 6 months"
                />
              </Form.Item>
              <Form.Item label="Sex">
                <Select
                  value={sex || undefined}
                  onChange={setSex}
                  placeholder="Select sex"
                  options={[
                    { value: "M", label: "M" },
                    { value: "F", label: "F" },
                    { value: "CM", label: "CM" },
                    { value: "SF", label: "SF" },
                  ]}
                  allowClear
                />
              </Form.Item>
              <Form.Item label="Breed">
                <Input
                  value={breed}
                  onChange={(e) => setBreed(e.target.value)}
                  placeholder="Breed"
                />
              </Form.Item>
              <Form.Item label="Zip Code">
                <Input
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  placeholder="Zip code"
                />
              </Form.Item>
            </Form>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 24,
            }}
          >
            <Button size="large" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button
              type="primary"
              size="large"
              disabled={shareInfo === null}
              onClick={() => setStep(2)}
            >
              Next
            </Button>
          </div>
        </>
      )}

      {/* Step 3: GPS Consent (placeholder) + Submit */}
      {step === 2 && (
        <>
          <Title level={5} style={{ color: "#1a365d", marginBottom: 16 }}>
            Would you like to share your GPS location?
          </Title>

          <Alert
            type="info"
            message="This feature is coming soon."
            showIcon
            style={{ marginBottom: 24 }}
          />

          {uploading && (
            <Progress
              percent={progress}
              status="active"
              style={{ marginBottom: 16 }}
            />
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 24,
            }}
          >
            <Button
              size="large"
              onClick={() => setStep(1)}
              disabled={uploading}
            >
              Back
            </Button>
            <Button
              type="primary"
              size="large"
              loading={uploading}
              onClick={handleSubmit}
            >
              {uploading ? "Uploading..." : "Submit"}
            </Button>
          </div>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Upload page                                                   */
/* ------------------------------------------------------------------ */
export default function UploadPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState(null); // null | "single" | "batch"

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <Title level={3} style={{ color: "#1a365d", marginBottom: 8 }}>
        New Test
      </Title>
      <Text
        type="secondary"
        style={{ display: "block", marginBottom: 24, lineHeight: 1.5 }}
      >
        Upload FeLV/FIV lateral flow assay cassette images for a new diagnostic
        test. Supported formats: JPG, PNG. Maximum 20MB per file.
      </Text>

      {/* Mode selector */}
      {!mode && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={["batch", "admin"].includes(user?.role) ? 12 : 24}>
            <Card
              hoverable
              onClick={() => setMode("single")}
              style={{ textAlign: "center", height: "100%" }}
              styles={{ body: { padding: "2rem 1.5rem" } }}
            >
              <FileImageOutlined
                style={{ fontSize: 36, color: "#2b6cb0", marginBottom: 12 }}
              />
              <Title level={5} style={{ marginBottom: 8 }}>
                Single Upload
              </Title>
              <Text type="secondary">
                Upload one image with optional patient info
              </Text>
            </Card>
          </Col>
          {["batch", "admin"].includes(user?.role) && (
            <Col xs={24} sm={12}>
              <Card
                hoverable
                onClick={() => setMode("batch")}
                style={{ textAlign: "center", height: "100%" }}
                styles={{ body: { padding: "2rem 1.5rem" } }}
              >
                <CopyOutlined
                  style={{ fontSize: 36, color: "#2b6cb0", marginBottom: 12 }}
                />
                <Title level={5} style={{ marginBottom: 8 }}>
                  Batch Upload
                </Title>
                <Text type="secondary">
                  Upload multiple images at once
                </Text>
              </Card>
            </Col>
          )}
        </Row>
      )}

      {/* Back to mode selection */}
      {mode && (
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          onClick={() => setMode(null)}
          style={{ padding: 0, marginBottom: 20 }}
        >
          Back to upload options
        </Button>
      )}

      {mode === "single" && <SingleUpload />}
      {mode === "batch" && <BatchUpload />}
    </div>
  );
}
