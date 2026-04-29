import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import SignupForm from "../components/SignupForm.jsx";
import { supabase } from "../lib/supabase.js";
import { createOnboardingAccount } from "../lib/uploadApi.js";

const ACCOUNT_EXISTS_MESSAGE =
  "An account already exists for this association. To discuss access please contact admin@politicalsolutions.uk";

const initialForm = {
  name: "",
  email: "",
  phone: "",
  associationId: "",
  password: "",
  confirmPassword: "",
};

async function hasActiveAssociationAccount(associationId) {
  if (!associationId) return false;
  const { data, error } = await supabase
    .from("user_permissions")
    .select("id")
    .eq("association_id", associationId)
    .eq("is_active", true)
    .limit(1);
  if (error) throw new Error(error.message || "Unable to check association access.");
  return Boolean(data?.length);
}

export default function SignUp() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [associations, setAssociations] = useState([]);
  const [loadingAssociations, setLoadingAssociations] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    let active = true;
    supabase
      .from("associations")
      .select("id,name")
      .order("name", { ascending: true })
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) {
          setErrors((current) => ({
            ...current,
            associationId: queryError.message || "Unable to load associations.",
          }));
          setAssociations([]);
        } else {
          setAssociations(data || []);
        }
      })
      .finally(() => {
        if (active) setLoadingAssociations(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedAssociation = useMemo(
    () => associations.find((association) => association.id === form.associationId) || null,
    [associations, form.associationId]
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrors({});

    setSubmitting(true);
    try {
      const accountExists = await hasActiveAssociationAccount(form.associationId);
      if (accountExists) {
        setErrors({ associationId: ACCOUNT_EXISTS_MESSAGE });
        return;
      }

      await createOnboardingAccount({
        name: form.name.trim(),
        fullName: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        associationId: form.associationId,
        associationName: selectedAssociation?.name || "",
        password: form.password,
      });
      navigate("/login?welcome=true");
    } catch (nextError) {
      setErrors({ associationId: nextError.message || "Unable to create account." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <section className="section">
        <div className="container centered">
          <Card>
            <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Create account</h1>
            <p className="muted" style={{ marginTop: 0 }}>
              One account is available for each association. New accounts start with restricted demo access.
            </p>
            <SignupForm
              associations={associations}
              form={form}
              loading={loadingAssociations}
              submitting={submitting}
              errors={errors}
              onChange={handleChange}
              onSubmit={handleSubmit}
              onValidationChange={setErrors}
            />
            <p className="muted" style={{ marginTop: 16 }}>
              Already have an account?{" "}
              <Link className="blog-inline-link" to="/login">
                Sign in
              </Link>
            </p>
          </Card>
        </div>
      </section>
      <Footer />
    </div>
  );
}

export { ACCOUNT_EXISTS_MESSAGE, hasActiveAssociationAccount };
