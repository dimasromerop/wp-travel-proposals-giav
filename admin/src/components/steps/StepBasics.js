import { useEffect, useMemo, useState } from '@wordpress/element';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Notice,
  Spinner,
  TextControl,
  SelectControl,
} from '@wordpress/components';
import API from '../../api';

const LANG_OPTIONS = [
  { label: 'Español', value: 'es' },
  { label: 'English', value: 'en' },
];

const CURRENCY_OPTIONS = [
  { label: 'EUR', value: 'EUR' },
  { label: 'USD', value: 'USD' },
  { label: 'GBP', value: 'GBP' },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function StepBasics({ initialValues = {}, onCreated, onNext, proposalId }) {
  const defaults = useMemo(
    () => ({
      proposal_title: '',
      customer_name: '',
      customer_email: '',
      customer_country: '', // ISO2 opcional
      customer_language: 'es',
      start_date: todayISO(),
      end_date: todayISO(),
      pax_total: 1,
      currency: 'EUR',
      ...initialValues,
    }),
    [initialValues]
  );

  const [values, setValues] = useState(defaults);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ✅ FIX: al volver atrás, rehidratar el formulario con initialValues
  useEffect(() => {
    setValues((prev) => ({
      ...prev,
      ...defaults,
    }));
  }, [defaults]);

  const set = (key) => (val) => setValues((v) => ({ ...v, [key]: val }));

  const onChangeStartDate = (v) => {
    setValues((prev) => {
      const next = { ...prev, start_date: v };
      if (next.end_date && v && next.end_date < v) {
        next.end_date = v;
      }
      return next;
    });

    // UX: saltar al campo fin y abrir picker si se puede
    window.setTimeout(() => {
      const el = document.getElementById('wp-travel-end-date');
      if (!el) return;
      el.focus();
      if (typeof el.showPicker === 'function') {
        try {
          el.showPicker();
        } catch (e) {}
      }
    }, 0);
  };

  const onChangeEndDate = (v) => {
    setValues((prev) => {
      if (prev.start_date && v && v < prev.start_date) {
        return { ...prev, end_date: prev.start_date };
      }
      return { ...prev, end_date: v };
    });
  };

  const validate = () => {
    if (!values.customer_name?.trim()) return 'El nombre del cliente es obligatorio.';
    if (!values.start_date) return 'La fecha de inicio es obligatoria.';
    if (!values.end_date) return 'La fecha de fin es obligatoria.';
    if (values.end_date < values.start_date) return 'La fecha fin no puede ser anterior a la fecha inicio.';
    const pax = parseInt(values.pax_total, 10);
    if (Number.isNaN(pax) || pax < 1) return 'Pax debe ser un número >= 1.';
    if (values.customer_email && !/^\S+@\S+\.\S+$/.test(values.customer_email)) {
      return 'El email no parece válido (si lo rellenas, que sea correcto).';
    }
    if (values.customer_country && values.customer_country.length !== 2) {
      return 'País debe ser ISO2 (2 letras) o vacío.';
    }
    return '';
  };

  const onSubmit = async () => {
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }

    setLoading(true);
    setError('');

    // ✅ payload definido SIEMPRE (antes del try)
    const payload = {
      ...values,
      pax_total: parseInt(values.pax_total, 10),
      customer_country: values.customer_country ? values.customer_country.toUpperCase() : '',
    };

    try {
      if (proposalId) {
        // ya existe: no recrear propuesta, solo avanzar guardando basics
        await API.updateProposal(proposalId, payload);
        onNext?.({ basics: payload });
        return;
      }

      const res = await API.createProposal(payload);

      onCreated?.({
        proposalId: res.proposal_id,
        basics: payload,
      });
    } catch (e) {
      setError(e?.message || 'Error creando la propuesta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <strong>Datos básicos</strong>
      </CardHeader>

      <CardBody>
        {error && (
          <Notice status="error" isDismissible onRemove={() => setError('')}>
            {error}
          </Notice>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TextControl
            label="Título de la propuesta"
            value={values.proposal_title}
            onChange={set('proposal_title')}
            placeholder="Escapada a la Costa del Sol"
          />

          <TextControl
            label="Nombre del cliente *"
            value={values.customer_name}
            onChange={set('customer_name')}
            placeholder="John Smith"
          />

          <TextControl
            label="Email"
            value={values.customer_email}
            onChange={set('customer_email')}
            placeholder="john@email.com"
          />

          <TextControl
            label="País (ISO2)"
            value={values.customer_country}
            onChange={set('customer_country')}
            placeholder="ES / US / CA"
            maxLength={2}
          />

          <SelectControl
            label="Idioma"
            value={values.customer_language}
            options={LANG_OPTIONS}
            onChange={set('customer_language')}
          />

          <TextControl
            label="Fecha inicio *"
            type="date"
            value={values.start_date}
            onChange={onChangeStartDate}
          />

          <TextControl
            id="wp-travel-end-date"
            label="Fecha fin *"
            type="date"
            value={values.end_date}
            onChange={onChangeEndDate}
            min={values.start_date || undefined}
          />

          <TextControl
            label="Pax *"
            type="number"
            min={1}
            value={String(values.pax_total)}
            onChange={set('pax_total')}
          />

          <SelectControl
            label="Moneda"
            value={values.currency}
            options={CURRENCY_OPTIONS}
            onChange={set('currency')}
          />
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <Button variant="primary" onClick={onSubmit} disabled={loading}>
            Continuar
          </Button>
          {loading && <Spinner />}
        </div>
      </CardBody>
    </Card>
  );
}
