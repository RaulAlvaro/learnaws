# Método y estrategia: AWS Solutions Architect – Associate (SAA-C03)

Guía corta y práctica. Léela una vez completa y vuelve a las secciones 2, 5 y 6 cuando lo necesites.

---

## 1. Cómo funciona el método (y por qué)

Cada concepto pasa por el mismo ciclo:

1. **Pretesting**: antes de ver la explicación respondes una pregunta sobre el concepto. Lo normal es fallar, y está bien: intentar recordar algo que todavía no sabes prepara la memoria para la respuesta correcta. Esto se llama *pretesting effect* ([Richland, Kornell & Kao, 2009](https://doi.org/10.1037/a0016496)).
2. **Micro ficha**: una explicación breve, centrada en el discriminador (qué lo diferencia de su "gemelo" confundible).
3. **Práctica de recuperación**: preguntas estilo examen, sin mirar la ficha.
4. **Autoexplicación**: escribes (o dices) *por qué* tu respuesta es correcta y por qué las otras no. Explicarte a ti mismo mejora la comprensión ([Bisra et al., 2018, meta-análisis](https://doi.org/10.1007/s10648-018-9434-x)).
5. **Repetición espaciada por concepto (FSRS)**: la app programa cada concepto según tu memoria real con el algoritmo [FSRS](https://github.com/open-spaced-repetition/fsrs4anki/wiki). Los repasos llegan justo cuando estás por olvidar.

### Successive relearning: cuándo un concepto está "graduado"

Un concepto se gradúa cuando cumples **3 aciertos iniciales + 3 repasos espaciados correctos sin ayuda**. Este criterio viene de la investigación de Rawson y Dunlosky sobre *successive relearning*: combinar práctica hasta un criterio con reaprendizaje en sesiones espaciadas produce retención duradera y eficiente ([Rawson & Dunlosky, 2011](https://doi.org/10.1037/a0023956)). Acertar una vez no significa que lo sabes; acertar en días distintos sin ayuda, sí.

### Interleaving de servicios confundibles

La app mezcla a propósito los servicios que se parecen (SQS vs SNS vs Kinesis, Multi-AZ vs read replica, Gateway vs Interface endpoint). Intercalar ayuda sobre todo cuando las categorías son **similares y fáciles de confundir**, porque te obliga a buscar el discriminador ([Brunmair & Richter, 2019](https://doi.org/10.1037/bul0000209); ensayo controlado en aulas reales: [Rohrer et al., 2020](https://doi.org/10.1037/edu0000367)). Se siente más difícil que estudiar por bloques. Esa dificultad es la que produce el aprendizaje.

### Certeza y calibración

Antes de ver el resultado indicas tu certeza (baja / media / alta). Por dos razones:

- **Errores de alta confianza**: cuando estabas seguro y fallas, la corrección se fija mejor (*hypercorrection effect*, [Butterfield & Metcalfe, 2001](https://doi.org/10.1037/0278-7393.27.6.1491)). La app prioriza esos errores.
- **Calibración**: aprendes a distinguir "lo sé" de "me suena". En el examen eso decide qué preguntas marcas para revisar.

### Feedback explicativo siempre

Cada respuesta, correcta o no, trae la explicación. En preguntas de opción múltiple, el feedback aumenta lo que aprendes y evita que te quedes con las opciones incorrectas que leíste ([Butler & Roediger, 2008](https://doi.org/10.3758/MC.36.3.604)).

### Por qué la IA solo da pistas después de tu intento

- En un experimento con ~1.000 estudiantes, quienes usaron GPT-4 sin restricciones rindieron mejor durante la práctica, pero **peor** en el examen sin IA. La versión con salvaguardas (pistas en lugar de respuestas) mitigó ese daño ([Bastani et al., 2025, PNAS](https://doi.org/10.1073/pnas.2422633122)).
- En Harvard, un tutor de IA diseñado con buenas prácticas pedagógicas (guía paso a paso, sin regalar la solución) produjo más aprendizaje en menos tiempo que una clase de aprendizaje activo ([Kestin et al., 2025, Scientific Reports](https://www.nature.com/articles/s41598-025-97652-6)).

Conclusión: la IA ayuda cuando te hace pensar y perjudica cuando piensa por ti. Por eso en la app **primero respondes y después pides pistas**.

### Qué NO hacemos

Releer, subrayar y resumir tienen **baja utilidad**. La práctica de recuperación y la práctica distribuida tienen **alta utilidad** ([Dunlosky et al., 2013](https://doi.org/10.1177/1529100612453266)). Si te sorprendes releyendo una ficha por tercera vez, cierra la ficha y respóndete una pregunta.

---

## 2. Tu hora diaria

| Bloque | Tiempo | Qué haces |
|---|---|---|
| Repasos debidos | 15 min | Todo lo que FSRS marca para hoy. Siempre primero. |
| Conceptos nuevos | 30 min | Pretest → ficha → práctica → autoexplicación (2–4 conceptos). |
| Interleaving + error log | 15 min | Set mixto de confundibles y revisión de tus errores (sobre todo los de alta certeza). |

- **Si solo tienes 20 minutos**, haz solo repasos. No saltes repasos para meter conceptos nuevos: lo nuevo sin repaso se olvida.
- **Voice mode (manos libres)**: úsalo para recuperación cuando quieras descansar la vista (caminando, en transporte). Responde en voz alta antes de escuchar la respuesta.
- **Labs**: 1 lab reemplaza el bloque de conceptos nuevos de ese día. Haz el Lab 0 (Budgets + Identity Center) antes que cualquier otro.

---

## 3. Plan macro con 1 h/día (~8–10 semanas)

| Fase | Semanas | Objetivo |
|---|---|---|
| **Diagnóstico** | 1 | Pretest amplio de los 4 dominios para medir el punto de partida. Lab 0. |
| **Construcción** | 1–6 | Conceptos nuevos según el peso de cada dominio (D1 30%, D2 26%, D3 24%, D4 20%), **intercalados**, no un dominio tras otro. Un lab por semana. |
| **Consolidación** | 6–8 | Casi sin conceptos nuevos: repasos, interleaving intensivo y ataque al error log. |
| **Simulacros** | 8–10 | Exámenes completos y decisión de agenda. |

**Mini-mock semanal**: 25 preguntas en 50 minutos, desde la semana 2. Mide tendencia y entrena el ritmo.

**Al final**: 2 simulacros completos de 65 preguntas en 130 minutos con preguntas *held-out* (que no viste antes), y **un simulacro externo**: el AWS Skill Builder Official Practice Exam o Tutorials Dojo.

### Gate de preparación (regla dura)

Agendas el examen solo cuando se cumplen **todas** estas condiciones:

1. **2 simulacros completos held-out consecutivos ≥ 80%**,
2. **ningún dominio < 70%**,
3. **confirmado con un simulacro externo** (≥ 80%).

Cuando cumplas el gate, **agenda el examen para 5–7 días después** y usa esos días solo para repasos e interleaving. **Nunca agendes antes del gate.** Una fecha fija no te hace aprender más rápido: te lleva a estudiar peor (releer en pánico).

Si repruebas, debes esperar **14 días calendario** antes de volver a rendirlo y pagar la tarifa completa otra vez ([AWS: After testing](https://aws.amazon.com/certification/policies/after-testing/)). El gate existe para que eso no pase.

---

## 4. El examen SAA-C03

Datos oficiales ([página de la certificación](https://aws.amazon.com/certification/certified-solutions-architect-associate/) y [exam guide](https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html)):

- **65 preguntas**: 50 puntúan y 15 no puntúan. Las que no puntúan no están identificadas, así que trátalas todas igual.
- **130 minutos**.
- **Puntaje escalado 100–1000; aprobado con 720**.
- **Modelo compensatorio**: no necesitas aprobar cada dominio por separado, solo el total.
- **Tipos**: *multiple choice* (1 correcta de 4) y *multiple response* (2 o más correctas de 5 o más).
- **Sin penalización por adivinar**: una pregunta sin responder cuenta como incorrecta. **Nunca dejes una en blanco.**
- **Costo: USD 150**. En centro Pearson VUE u online con supervisión.
- **Idioma**: está disponible en español (Latinoamérica), pero **rinde en inglés**. Es el idioma de la documentación, de la consola y del material de práctica, y evitas traducciones ambiguas.
- **ESL +30 minutos**: los hablantes no nativos de inglés pueden pedir 30 minutos extra al rendir en inglés. Se solicita **una vez, antes de registrarte para un examen**: en aws.training/Certification → *Go to your Account* → *Request Exam Accommodations* → *Request Accommodation* → tipo *ESL +30 MINUTES*. Queda aplicado a los exámenes futuros ([AWS: Before testing](https://aws.amazon.com/certification/policies/before-testing/)). Pídelo **antes** de agendar. Si tienes un examen ya agendado, puede que no te deje solicitarlo.

### Dominios

| Dominio | Peso |
|---|---|
| D1 – Design Secure Architectures | 30% |
| D2 – Design Resilient Architectures | 26% |
| D3 – Design High-Performing Architectures | 24% |
| D4 – Design Cost-Optimized Architectures | 20% |

### No uses braindumps

Sitios como ExamTopics y los "dumps" con preguntas reales filtradas violan el [AWS Certification Program Agreement](https://aws.amazon.com/certification/certification-agreement/). El acuerdo prohíbe usar "unauthorized materials" y permite a AWS **cancelar resultados, revocar la certificación y prohibirte participar en el programa**, sin reembolso. Además, memorizar respuestas no entrena el razonamiento que necesitas para las preguntas nuevas.

---

## 5. Estrategia en el examen

### Palabras clave → dirección de la respuesta

| Si la pregunta dice… | Piensa en… |
|---|---|
| *least operational overhead* / *fewest management tasks* | Servicios administrados o serverless (Lambda, Fargate, DynamoDB, Aurora Serverless, S3) |
| *most cost-effective* | La opción más barata que **sí cumple** todos los requisitos (Spot si tolera interrupciones, lifecycle a Glacier, Gateway endpoint en vez de NAT) |
| *highly available* / *fault tolerant* | Multi-AZ, ALB + ASG en 2+ AZs, Aurora |
| *disaster recovery* con RPO/RTO | Backup & restore → pilot light → warm standby → multi-site (de más barato/lento a más caro/rápido) |
| *decouple* / *buffer* / *absorb spikes* | SQS |
| *fan-out* / notificar a varios | SNS (+ SQS), EventBridge |
| *real-time streaming* / *replay* / múltiples consumidores | Kinesis Data Streams |
| *load streaming data into S3/Redshift* | Amazon Data Firehose |
| *static IP* / TCP/UDP global | Global Accelerator o NLB |
| *low latency global* contenido web | CloudFront |
| *without internet* / privado | VPC endpoints (Gateway para S3/DynamoDB, Interface para el resto) |
| *temporary credentials* / app en EC2 | IAM role (instance profile) |
| *encrypt* + auditoría de uso de keys | KMS (SSE-KMS) |
| *store secrets* con rotación automática | Secrets Manager |
| *shared file system* Linux / Windows | EFS / FSx for Windows File Server |
| *HPC* / Lustre | FSx for Lustre |
| *microseconds* DynamoDB | DAX |

### Técnica de eliminación

1. Lee **la última oración primero** (qué te piden exactamente), después el escenario.
2. Subraya mentalmente los **requisitos duros** (HA, costo, sin cambios de código, cumplimiento).
3. Elimina las opciones que **violan un requisito**, aunque sean técnicamente correctas.
4. Entre las que quedan, elige la que cumple con **menos componentes y menos gestión**.
5. Desconfía de opciones que "inventan" funciones (por ejemplo, "configure S3 to automatically replicate to EBS").

### Tiempo

- ~**2 minutos por pregunta** (130 / 65). Con ESL +30, ~2,5 min.
- Pregunta que te toma más de 3 minutos → responde tu mejor opción, **márcala (flag)** y sigue.
- Deja 15–20 minutos al final para revisar las marcadas. Cambia una respuesta solo si encuentras un argumento concreto, no por intuición.

### Multiple response

- El enunciado dice cuántas elegir ("Choose TWO"). Relee esa línea antes de enviar.
- Evalúa cada opción **por separado** como verdadero/falso contra el escenario.
- A veces las dos correctas se complementan (por ejemplo, "crear el role" + "adjuntarlo a la instancia").

---

## 6. Trampas típicas

| Par confundible | Discriminador |
|---|---|
| Security Group vs NACL | SG: stateful, solo allow, a nivel de instancia/ENI. NACL: stateless, allow + deny, a nivel de subnet, reglas numeradas. Bloquear una IP → NACL. |
| RDS Multi-AZ vs read replica | Multi-AZ = HA, síncrono, mismo endpoint, el standby no lee. Read replica = escalar lecturas, asíncrono, endpoint propio. |
| Gateway vs Interface endpoint | Gateway: solo S3/DynamoDB, gratis, vía route table. Interface: PrivateLink, ENI + SG, con costo, alcanzable desde on-premises. |
| NAT Gateway vs Internet Gateway | IGW: entrada/salida para subnets públicas. NAT: solo salida para subnets privadas; va en subnet pública; uno por AZ para HA. |
| SQS vs SNS vs Kinesis | SQS: cola pull, un consumidor por mensaje. SNS: push pub/sub a muchos. Kinesis: stream ordenado por shard, replay, múltiples consumidores en tiempo real. |
| SQS Standard vs FIFO | Standard: at-least-once, throughput casi ilimitado. FIFO: orden + exactly-once processing, menor throughput. |
| CloudFront vs Global Accelerator | CloudFront: HTTP(S), caché en edge. GA: TCP/UDP, IPs anycast estáticas, sin caché. |
| ALB vs NLB | ALB: capa 7, rutas por path/host. NLB: capa 4, IP estática, millones de req/s, latencia ultra baja. |
| SSE-S3 vs SSE-KMS | KMS: auditoría en CloudTrail, control por key policy, cuotas de KMS. S3: simple, sin costo extra. |
| Secrets Manager vs Parameter Store | Secrets Manager: rotación automática nativa, de pago. Parameter Store: config y secretos simples, tier estándar gratis. |
| EBS vs EFS vs FSx | EBS: bloque, una AZ, una instancia (salvo Multi-Attach io1/io2). EFS: NFS compartido Linux multi-AZ. FSx: Windows (SMB), Lustre (HPC), NetApp ONTAP, OpenZFS. |
| S3 Standard-IA vs One Zone-IA vs Glacier | IA: acceso infrecuente con lectura inmediata (One Zone = 1 AZ, datos recreables). Glacier Instant/Flexible/Deep Archive: archivo, con minutos a horas de recuperación según la clase. |
| Scaling: target tracking vs step vs scheduled | Mantener una métrica → target tracking. Escalones por tamaño de alarma → step. Horario conocido → scheduled. |
| IAM policy vs SCP | IAM otorga permisos. SCP solo limita el máximo en cuentas/OUs de Organizations y no otorga nada. |
| Shield vs WAF vs GuardDuty | Shield: DDoS. WAF: filtros L7 (SQLi, XSS, rate limiting). GuardDuty: detección de amenazas analizando logs. |
| Backup DR: pilot light vs warm standby | Pilot light: solo el núcleo (datos) corriendo, se escala al fallar. Warm standby: versión reducida pero completa, siempre activa. |

---

## 7. Reglas de oro de la app

1. **Responde antes de pedir ayuda a la IA.** Primero intentas y después pides pistas. Nunca al revés.
2. **Declara tu certeza con honestidad.** Marcar "alta" para quedar bien destruye tu calibración y esconde tus errores más valiosos.
3. **Explica tu porqué.** Una respuesta correcta sin razón es suerte. La autoexplicación es parte del ejercicio.
4. **No saltes repasos.** Los repasos debidos van primero, siempre. Si hay poco tiempo, solo repasos.
5. **El español es una muleta que vas a dejar.** A medida que avances, pasa las preguntas a inglés. El examen lo rindes en inglés.
6. **Reporta las preguntas erróneas o ambiguas.** Si una explicación contradice la documentación de AWS, márcala. La documentación oficial manda.
7. **Respeta el gate.** No agendes el examen porque "ya casi". Los números deciden.

---

## 8. Recursos externos opcionales

- **AWS Skill Builder (gratis)**:
  - [Official Practice Question Set SAA-C03](https://skillbuilder.aws/learn/6NV91XYP1P/official-practice-question-set-aws-certified-solutions-architect--associate-saac03--english/N1HSPV1K17): 20 preguntas oficiales con explicaciones. Úsalo como diagnóstico en la semana 1 o como validación intermedia.
  - [Exam Prep Plan / Exam Prep Standard Course](https://skillbuilder.aws/category/exam-prep/solutions-architect-associate-SAA-C03): repaso oficial por dominio.
- **Skill Builder con suscripción (de pago)**: incluye el [Official Practice Exam](https://skillbuilder.aws/learn/R3KVD4BBJY/official-practice-exam-aws-certified-solutions-architect--associate-saac03--english/W7GU3R1HCT) (65 preguntas, formato real). Es la mejor opción para el simulacro externo del gate. Verifica el precio actual de la suscripción y activa solo el mes que la uses.
- **[Tutorials Dojo – SAA-C03 Practice Exams](https://portal.tutorialsdojo.com/courses/aws-certified-solutions-architect-associate-practice-exams/)** (alrededor de USD 15, verifica el precio): muchos simulacros con explicaciones detalladas. Alternativa válida para el simulacro externo.
- **Curso de Adrian Cantrill (SAA-C03)**: **no lo sigas de punta a punta.** Úsalo solo para ver videos puntuales cuando la app marque que fallas un concepto de forma repetida (por ejemplo, VPC routing o DR). Mirar videos no reemplaza la práctica de recuperación.
- **Documentación de AWS y FAQs de cada servicio**: la fuente de verdad cuando hay dudas.
