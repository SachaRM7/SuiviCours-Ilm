import { Navigate, useParams } from "react-router-dom";

// Kept for bookmarks created before the course-centric navigation redesign.
export function CourseResourcesPage() {
  const { courseId } = useParams();
  return <Navigate replace to={courseId ? `/cours/${courseId}` : "/cours"} />;
}
