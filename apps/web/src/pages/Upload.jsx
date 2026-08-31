import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation, useSearchParams, Navigate } from "react-router-dom";
import {
  Typography,
  Upload,
  Steps,
  Progress,
  Alert,
  Collapse,
  Radio,
  Select,
  Form,
  Input,
  Result,
  Button,
  Tag,
  App,
} from "antd";
import {
  InboxOutlined,
  CameraOutlined,
} from "@ant-design/icons";
import { buildCameraPath } from "../components/cameraNavigation";
import { uploadSingle } from "../services/api";
import diseases from "@shared/data/diseases.json";
import breeds from "@shared/data/breeds.json";
import ageOptions from "@shared/data/age_options.json";
import { isDiseaseUnderDevelopment } from "../utils/diseaseAvailability";
import { useAuth } from "../context/authStore";
import { isClinicalRole } from "./userRoles";
import { startTestPathFor } from "../utils/shellPaths";

const { Title, Text } = Typography;
const { Dragger } = Upload;

const ALLOWED_TYPES = ["image/jpeg", "image/png"];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

const SPECIES_LABEL = { cat: "Cats", dog: "Dogs" };

// Age, sex and breed are secondary context. The clinic form shows them flat;
// the owner form folds them away so the simple path stays short (D6: same
// field set, all optional, secondary fields collapsed).
function PatientDetailFields({
  ownerView,
  age,
  setAge,
  sex,
  setSex,
  breed,
  setBreed,
  ageList,
  breedList,
}) {
  const fields = (
    <>
      <Form.Item label={ownerView ? "Age (optional)" : "Age"}>
        <Select
          value={age || undefined}
          onChange={setAge}
          placeholder="Select age"
          options={ageList.map((a) => ({ value: a, label: a }))}
          allowClear
        />
      </Form.Item>
      <Form.Item label={ownerView ? "Sex (optional)" : "Sex"}>
        <Select
          value={sex || undefined}
          onChange={setSex}
          placeholder="Select sex"
          options={[
            { value: "M", label: "M" },
            { value: "F", label: "F" },
            { value: "CM", label: "CM" },
            { value: "CF", label: "CF" },
          ]}
          allowClear
        />
      </Form.Item>
      <Form.Item label={ownerView ? "Breed (optional)" : "Breed"}>
        <Select
          value={breed || undefined}
          onChange={setBreed}
          placeholder="Select breed"
          options={breedList.map((b) => ({ value: b, label: b }))}
          showSearch
          allowClear
        />
      </Form.Item>
    </>
  );

  if (!ownerView) {
    return fields;
  }

  return (
    <Collapse
      ghost
      items={[
        {
          key: "details",
          label: "More details (optional)",
          children: fields,
        },
      ]}
      style={{ marginBottom: 8 }}
    />
  );
}

export default function UploadPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { message } = App.useApp();
  const { user } = useAuth();
  const ownerView = !isClinicalRole(user?.role);
  const startPath = startTestPathFor(user);

  // The disease id comes from the Home page; without it the upload page has
  // no workflow context, so we bounce the user back rather than guess.
  const diseaseId = searchParams.get("disease");
  const disease = useMemo(
    () =>
      isDiseaseUnderDevelopment(diseaseId)
        ? undefined
        : diseases.find((d) => d.id === diseaseId),
    [diseaseId]
  );

  const [step, setStep] = useState(0);

  // Step 1: file
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);

  // Step 2: patient info. Species is locked by the chosen disease.
  const [shareInfo, setShareInfo] = useState(null);
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [breed, setBreed] = useState("");
  const [areaCode, setAreaCode] = useState("");
  const [preventiveTreatment, setPreventiveTreatment] = useState(null);

  // Submission
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  // Handle return from the camera capture page.
  useEffect(() => {
    if (location.state?.fromCamera) {
      const dataUrl = sessionStorage.getItem("capturedImage");
      if (dataUrl) {
        sessionStorage.removeItem("capturedImage");
        fetch(dataUrl)
          .then((res) => res.blob())
          .then((blob) => {
            const capturedFile = new File([blob], `capture_${Date.now()}.jpg`, {
              type: "image/jpeg",
            });
            setFile(capturedFile);
            setPreview(URL.createObjectURL(capturedFile));
            setStep(1);
          });
      }
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  if (!disease) {
    return <Navigate to={startPath} replace />;
  }

  const speciesLabel = SPECIES_LABEL[disease.species];
  const breedList = breeds[disease.species] || [];
  const ageList = ageOptions[disease.species] || [];

  const selectFile = (f) => {
    if (!ALLOWED_TYPES.includes(f.type)) {
      message.error(`${f.name}: unsupported format. Only JPG/PNG allowed.`);
      return;
    }
    if (f.size > MAX_SIZE) {
      message.error(`${f.name}: exceeds 20MB limit.`);
      return;
    }
    setError("");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!file) return;

    // Tick Borne requires an explicit Yes/No on preventive treatment when the
    // user is sharing info; block the submit rather than silently drop it.
    if (
      shareInfo &&
      disease.needs_preventive_treatment &&
      preventiveTreatment === null
    ) {
      setError("Please answer the preventive treatment question.");
      return;
    }

    setError("");
    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("disease_category", disease.label);
    formData.append("share_info", shareInfo ? "true" : "false");

    if (shareInfo) {
      if (age) formData.append("age", age);
      if (sex) formData.append("sex", sex);
      if (breed) formData.append("breed", breed);
      if (areaCode) formData.append("area_code", areaCode);
      if (disease.needs_preventive_treatment && preventiveTreatment !== null) {
        formData.append("preventive_treatment", preventiveTreatment ? "true" : "false");
      }
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

  if (result) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <Result
          status="success"
          title="Upload Successful"
          subTitle={
            <>
              <div>Image ID: {result.id}</div>
              {result.patient_info && <div>Patient info saved.</div>}
            </>
          }
          extra={[
            <Button
              type="primary"
              key="view"
              onClick={() => navigate(`/results?image=${result.id}`)}
            >
              View Result
            </Button>,
          ]}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <Title level={3} style={{ color: "var(--ink-strong)", marginBottom: 8 }}>
        {disease.label}
      </Title>
      <div style={{ marginBottom: 16 }}>
        <Tag color={disease.species === "cat" ? "magenta" : "blue"}>
          {speciesLabel}
        </Tag>
        <Tag>{disease.category}</Tag>
      </div>
      <Text
        type="secondary"
        style={{ display: "block", marginBottom: 24, lineHeight: 1.5 }}
      >
        {ownerView
          ? "Take or choose one clear photo of the whole test cassette. JPG or PNG, up to 20MB."
          : `Upload a single lateral flow assay cassette image for the ${disease.label} workflow. Supported formats: JPG, PNG. Maximum 20MB.`}
      </Text>

      <Steps
        current={step}
        items={[
          { title: "Image" },
          { title: "Patient Info" },
          { title: "Submit" },
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
              return false;
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

          <div
            onClick={() => navigate(buildCameraPath(location.search))}
            style={{ position: "relative", marginBottom: 16, cursor: "pointer" }}
          >
            <Dragger
              showUploadList={false}
              beforeUpload={() => false}
              openFileDialogOnClick={false}
              style={{ pointerEvents: "none" }}
            >
              <p className="ant-upload-drag-icon">
                <CameraOutlined />
              </p>
              <p className="ant-upload-text">Tap to capture with camera</p>
              <p className="ant-upload-hint">
                Use your device camera to take a photo
              </p>
            </Dragger>
          </div>

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

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
            <Button size="large" onClick={() => navigate(startPath)}>Back</Button>
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
          <Title level={5} style={{ color: "var(--ink-strong)", marginBottom: 16 }}>
            {ownerView
              ? "Would you like to add a few optional details about your pet? This helps track disease activity in your area."
              : "Would you like to share some confidential information regarding the patient?"}
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
              {disease.needs_preventive_treatment && (
                <Form.Item
                  label={
                    ownerView
                      ? "Has your dog had a tick or heartworm preventive in the last 6 months?"
                      : "Was there a preventive treatment in the last 6 months?"
                  }
                >
                  <Radio.Group
                    value={preventiveTreatment}
                    onChange={(e) => setPreventiveTreatment(e.target.value)}
                    optionType="button"
                    buttonStyle="solid"
                  >
                    <Radio.Button value={true}>Yes</Radio.Button>
                    <Radio.Button value={false}>No</Radio.Button>
                  </Radio.Group>
                </Form.Item>
              )}
              <Form.Item
                label={ownerView ? "ZIP code, for the community map" : "Area Code"}
              >
                <Input
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value)}
                  placeholder={ownerView ? "e.g. 43210" : "Area code"}
                />
              </Form.Item>
              <PatientDetailFields
                ownerView={ownerView}
                age={age}
                setAge={setAge}
                sex={sex}
                setSex={setSex}
                breed={breed}
                setBreed={setBreed}
                ageList={ageList}
                breedList={breedList}
              />
            </Form>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
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

      {/* Step 3: Submit */}
      {step === 2 && (
        <>
          <Title level={5} style={{ color: "var(--ink-strong)", marginBottom: 16 }}>
            Ready to submit?
          </Title>

          <Text
            type="secondary"
            style={{ display: "block", marginBottom: 24, lineHeight: 1.6 }}
          >
            {ownerView
              ? "We will read the photo and show you the result in plain language. Any details you added stay anonymous in community statistics."
              : "The uploaded image will be submitted with the patient information you entered, including the manual Area Code when provided."}
          </Text>

          {uploading && (
            <Progress
              percent={progress}
              status="active"
              style={{ marginBottom: 16 }}
            />
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
            <Button size="large" onClick={() => setStep(1)} disabled={uploading}>
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
    </div>
  );
}
