import SwiftUI

struct TransactionFormView: View {
  enum Mode {
    case create
    case edit(Transaction)
  }

  let mode: Mode
  @ObservedObject var vm: TransactionsViewModel

  @Environment(\.dismiss) private var dismiss

  @State private var kind: TransactionKind = .income
  @State private var title = ""
  @State private var subtitle = ""
  @State private var category = ""
  @State private var amountText = ""
  @State private var currency: SupportedCurrency = .TRY
  @State private var status: TransactionStatus = .paid
  @State private var paidAmountText = ""
  @State private var occurredOn = Date()
  @State private var invoiceStatus: InvoiceStatus = .none
  @State private var paymentMethod = ""
  @State private var patientId = ""
  @State private var descriptionText = ""
  @State private var patients: [Patient] = []
  @State private var isLoadingPatients = false
  @State private var isSaving = false
  @State private var formError: String?

  private static let dayOut: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "tr_TR")
    f.dateFormat = "yyyy-MM-dd"
    return f
  }()

  private var amountMinor: Int? { MoneyInput.moneyMinor(fromMajor: amountText) }
  private var paidAmountMinor: Int? { MoneyInput.moneyMinor(fromMajor: paidAmountText) }

  private var canSave: Bool {
    guard !isSaving else { return false }
    let name = title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty, let amount = amountMinor, amount > 0 else { return false }
    if status == .partial {
      guard let paid = paidAmountMinor, paid > 0 else { return false }
    }
    return true
  }

  var body: some View {
    NavigationStack {
      Form {
        if let formError {
          Section {
            Text(formError)
              .font(.footnote)
              .foregroundStyle(VerimayaTheme.danger)
          }
        }

        Section {
          Picker("Tür", selection: $kind) {
            ForEach(TransactionKind.allCases) { k in
              Text(k.label).tag(k)
            }
          }
          .pickerStyle(.segmented)

          TextField("Başlık", text: $title)
          TextField("Alt başlık", text: $subtitle)
          TextField("Kategori", text: $category)
        }

        Section {
          TextField("Tutar", text: $amountText)
            .keyboardType(.decimalPad)
          Picker("Para birimi", selection: $currency) {
            ForEach(SupportedCurrency.allCases) { c in
              Text(c.rawValue).tag(c)
            }
          }
          Picker("Durum", selection: $status) {
            ForEach(TransactionStatus.allCases) { s in
              Text(s.label).tag(s)
            }
          }
          if status == .partial {
            TextField("Ödenen tutar", text: $paidAmountText)
              .keyboardType(.decimalPad)
          }
          DatePicker("Tarih", selection: $occurredOn, displayedComponents: .date)
            .environment(\.locale, Locale(identifier: "tr_TR"))
        }

        Section {
          Picker("Fatura durumu", selection: $invoiceStatus) {
            ForEach(InvoiceStatus.allCases) { s in
              Text(s.label).tag(s)
            }
          }
          TextField("Ödeme yöntemi", text: $paymentMethod)
          patientPicker
          TextField("Açıklama", text: $descriptionText, axis: .vertical)
            .lineLimit(3...8)
        }
      }
      .scrollContentBackground(.hidden)
      .background(VerimayaTheme.bg)
      .navigationTitle(navTitle)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Vazgeç") { dismiss() }
            .disabled(isSaving)
        }
        ToolbarItem(placement: .confirmationAction) {
          if isSaving {
            ProgressView()
          } else {
            Button("Kaydet") {
              Task { await save() }
            }
            .disabled(!canSave)
          }
        }
      }
      .interactiveDismissDisabled(isSaving)
      .task { await bootstrap() }
    }
  }

  @ViewBuilder
  private var patientPicker: some View {
    if isLoadingPatients {
      HStack {
        Text("Hastalar yükleniyor…")
          .foregroundStyle(VerimayaTheme.textMuted)
        Spacer()
        ProgressView()
      }
    } else {
      Picker("Hasta", selection: $patientId) {
        Text("Yok").tag("")
        ForEach(patients) { p in
          Text(p.fullName).tag(p.id)
        }
      }
    }
  }

  private var navTitle: String {
    switch mode {
    case .create: "Yeni işlem"
    case .edit: "İşlemi düzenle"
    }
  }

  private func bootstrap() async {
    seed()
    isLoadingPatients = true
    defer { isLoadingPatients = false }
    do {
      let page = try await APIClient.shared.listPatients(limit: 100)
      patients = page.items
    } catch {
      // Patient picker is optional — keep form usable.
      if formError == nil {
        formError = (error as? APIError)?.errorDescription ?? error.localizedDescription
      }
    }
  }

  private func seed() {
    guard case let .edit(tx) = mode else { return }
    kind = tx.kind
    title = tx.title
    subtitle = tx.subtitle ?? ""
    category = tx.category ?? ""
    amountText = MoneyInput.majorText(fromMinor: tx.amount)
    currency = tx.currency
    status = tx.status
    paidAmountText = tx.paidAmount.map(MoneyInput.majorText(fromMinor:)) ?? ""
    occurredOn = Self.dayOut.date(from: tx.occurredOn) ?? Date()
    invoiceStatus = tx.invoiceStatus
    paymentMethod = tx.paymentMethod ?? ""
    patientId = tx.patientId ?? ""
    descriptionText = tx.description ?? ""
  }

  private func save() async {
    guard canSave, let amount = amountMinor, amount > 0 else { return }
    let name = title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty else { return }

    isSaving = true
    formError = nil
    defer { isSaving = false }

    let paid: Int? = status == .partial ? paidAmountMinor : nil
    let patient: String? = patientId.isEmpty ? nil : patientId
    let occurred = Self.dayOut.string(from: occurredOn)

    let ok: Bool
    switch mode {
    case .create:
      ok = await vm.create(TransactionCreate(
        kind: kind,
        title: name,
        subtitle: optionalTrimmed(subtitle),
        category: optionalTrimmed(category),
        occurredOn: occurred,
        status: status,
        invoiceStatus: invoiceStatus,
        paymentMethod: optionalTrimmed(paymentMethod),
        amount: amount,
        paidAmount: paid,
        currency: currency,
        patientId: patient,
        description: optionalTrimmed(descriptionText)
      ))
    case let .edit(tx):
      ok = await vm.update(id: tx.id, TransactionUpdate(
        kind: kind,
        title: name,
        subtitle: optionalTrimmed(subtitle),
        category: optionalTrimmed(category),
        occurredOn: occurred,
        status: status,
        invoiceStatus: invoiceStatus,
        paymentMethod: optionalTrimmed(paymentMethod),
        amount: amount,
        paidAmount: paid,
        currency: currency,
        patientId: patient,
        description: optionalTrimmed(descriptionText)
      ))
    }

    if ok {
      dismiss()
    } else {
      formError = vm.statusMessage ?? "Kayıt başarısız."
    }
  }

  private func optionalTrimmed(_ s: String) -> String? {
    let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
    return t.isEmpty ? nil : t
  }
}
