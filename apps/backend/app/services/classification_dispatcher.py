"""Route image classification to the workflow-specific classifier."""

from app.services.classifiers.common import ClassificationResult
from app.services.classifiers import fiv_felv, tick_borne


def classify_image_record(image) -> ClassificationResult:
    """Classify an Image ORM object using its disease workflow."""
    disease_category = getattr(image, "disease_category", None)

    if disease_category == tick_borne.WORKFLOW_LABEL:
        summary, confidence, detail = tick_borne.classify_single_image(image.file_path)
    else:
        summary, confidence, detail = fiv_felv.classify_single_image(image.file_path)

    return ClassificationResult(
        summary=summary,
        confidence=confidence,
        detail=detail,
    )


def preprocess_image_for_workflow(
    input_path: str,
    output_path: str,
    disease_category: str | None,
) -> None:
    """Write a workflow-specific preprocessed preview image."""
    if disease_category == tick_borne.WORKFLOW_LABEL:
        tick_borne.preprocess_cassette_image(input_path, output_path)
    else:
        fiv_felv.preprocess_cassette_image(input_path, output_path)
