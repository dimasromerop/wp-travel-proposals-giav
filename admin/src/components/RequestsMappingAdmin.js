import { useEffect, useMemo, useState } from '@wordpress/element';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Notice,
  Spinner,
  TextControl,
} from '@wordpress/components';
import API from '../api';

const FIELD_LABELS = [
  { key: 'package', label: 'Paquete' },
  { key: 'first_name', label: 'Nombre' },
  { key: 'last_name', label: 'Apellido' },
  { key: 'email', label: 'Email' },
  { key: 'telefono', label: 'Tel�fono' },
  { key: 'fecha_llegada', label: 'Fecha llegada' },
  { key: 'fecha_regreso', label: 'Fecha regreso' },
  { key: 'green_fees_per_player', label: 'Green-fees por jugador' },
  { key: 'jugadores', label: 'Jugadores' },
  { key: 'no_jugadores', label: 'No jugadores' },
  { key: 'vuelos_checkbox', label: 'Checkbox vuelos' },
  { key: 'aeropuerto_salida', label: 'Aeropuerto salida' },
  { key: 'mas_info', label: 'M�s info' },
];


export default function RequestsMappingAdmin() {
  const [forms, setForms] = useState({ es_form_id: '', en_form_id: '' });
  const [fields, setFields] = useState({});
  const [mappings, setMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [savingForms, setSavingForms] = useState(false);
  const [savingMapping, setSavingMapping] = useState(null);

  const load = async () => {
    setLoading(true);
    setNotice(null);
    try {
      const res = await API.getRequestMappingConfig();
      setForms({
        es_form_id: res.forms?.es_form_id || '',
        en_form_id: res.forms?.en_form_id || '',
      });
      setMappings( res.mappings || {} );
      setFields( res.fields || {} );
    } catch (err) {
      setNotice({
        status: 'error',
        message: err.message || 'No se pudo cargar la configuración.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateFormField = (key, value) => {
    setForms((prev) => ({ ...prev, [key]: value }));
  };

  const saveForms = async () => {
    setSavingForms(true);
    setNotice(null);
    try {
      await API.saveRequestFormsMapping({
        es_form_id: forms.es_form_id,
        en_form_id: forms.en_form_id,
      });
      setNotice({ status: 'success', message: 'IDs guardados correctamente.' });
      await load();
    } catch (err) {
      setNotice({
        status: 'error',
        message: err.message || 'No se pudieron guardar los IDs.',
      });
    } finally {
      setSavingForms(false);
    }
  };

  const updateMappingValue = (formId, fieldKey, value) => {
    setMappings((prev) => ({
      ...prev,
      [formId]: {
        ...(prev[formId] || {}),
        [fieldKey]: value,
      },
    }));
  };

  const saveMapping = async (formId) => {
    setSavingMapping(formId);
    setNotice(null);
    try {
      const payload = {};
      FIELD_LABELS.forEach((field) => {
        if ( mappings[formId]?.[field.key] ) {
          payload[field.key] = mappings[formId][field.key];
        }
      });
      await API.saveRequestFormMapping(formId, payload);
      setNotice({ status: 'success', message: 'Mapeo guardado.' });
      setSavingMapping(null);
      await load();
    } catch (err) {
      setNotice({
        status: 'error',
        message: err.message || 'No se pudo guardar el mapeo.',
      });
      setSavingMapping(null);
    }
  };

  const configuredForms = useMemo(() => {
    return [
      { label: 'Formulario ES', key: 'es_form_id', id: forms.es_form_id },
      { label: 'Formulario EN', key: 'en_form_id', id: forms.en_form_id },
    ];
  }, [forms]);

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto' }}>
      <Card>
        <CardHeader>
          <strong>Solicitudes recibidas (Gravity Forms)</strong>
        </CardHeader>
        <CardBody>
          {notice && (
            <Notice status={notice.status} isDismissible onRemove={() => setNotice(null)}>
              {notice.message}
            </Notice>
          )}

          <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
            <p style={{ margin: 0, color: '#475569' }}>
              Configura los IDs de los formularios en español y en inglés para que el plugin pueda sincronizar las
              entradas.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <TextControl
                label="Form ID (ES)"
                value={forms.es_form_id}
                onChange={(value) => updateFormField('es_form_id', value)}
                placeholder="Id del formulario en español"
              />
              <TextControl
                label="Form ID (EN)"
                value={forms.en_form_id}
                onChange={(value) => updateFormField('en_form_id', value)}
                placeholder="Id del formulario en inglés"
              />
            </div>
            <Button variant="primary" onClick={saveForms} isBusy={savingForms} disabled={savingForms}>
              Guardar formularios
            </Button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <Spinner />
            </div>
          ) : (
            configuredForms.map((form) => {
              if ( ! form.id ) {
                return (
                  <div key={form.key} style={{ padding: 16, border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 16 }}>
                    <strong>{form.label}</strong>
                    <p style={{ marginTop: 4, color: '#6b7280' }}>Configura primero el ID del formulario para ver el mapping.</p>
                  </div>
                );
              }

              const formFields = fields[form.id] || [];
              const mapping = mappings[form.id] || {};

              return (
                <div
                  key={form.id}
                  style={{
                    marginBottom: 24,
                    borderRadius: 16,
                    border: '1px solid #e5e7eb',
                    padding: 16,
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{form.label}</strong>
                      <p style={{ margin: '4px 0 0', color: '#475569' }}>Form ID #{form.id}</p>
                    </div>
                    <Button
                      variant="primary"
                      onClick={() => saveMapping(form.id)}
                      isBusy={savingMapping === form.id}
                      disabled={savingMapping === form.id}
                    >
                      Guardar mapeo
                    </Button>
                  </div>

                  <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
                    {FIELD_LABELS.map((field) => (
                      <TextControl
                        key={field.key}
                        label={`${field.label} - ID del campo`}
                        value={mapping[field.key] || ''}
                        onChange={(value) => updateMappingValue(form.id, field.key, value)}
                        placeholder={`ID del campo ${field.label}`}
                      />
                    ))}
                  </div>

                  {formFields.length ? (
                    <details style={{ marginTop: 16 }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#1d4ed8' }}>
                        Campos disponibles (ID / etiqueta)
                      </summary>
                      <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                        {formFields.map((field) => (
                          <div key={`${form.id}-${field.id}`} style={{ fontSize: 13, color: '#475569' }}>
                            #{field.id} — {field.label || 'Sin etiqueta'} <small>({field.type})</small>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : (
                    <p style={{ marginTop: 16, color: '#6b7280' }}>Sin campos registrados para este formulario.</p>
                  )}
                </div>
              );
            })
          )}
        </CardBody>
      </Card>
    </div>
  );
}
