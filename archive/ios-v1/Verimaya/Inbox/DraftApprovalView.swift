import SwiftUI

/// AI taslaklarının onay sayfası (MONEY-01).
///
/// Sunucu sessiz varsayılan kabul etmiyor: ödeme durumu, ödenen tutar, kur ve
/// karşı taraf açıkça doldurulmadan onay gönderilmez. Bu ekran da onları
/// kullanıcıya sorar — AI karar vermez.
struct DraftApprovalView: View {
  let message: InboundMessage
  let drafts: [TransactionDraft]
  let siblings: [InboundMessage]
  @ObservedObject var vm: InboxViewModel

  @Environment(\.dismiss) private var dismiss
  @State private var forms: [DraftForm] = []
  @State private var baseCurrency: SupportedCurrency = .TRY
  @State private var isApproving = false

  var body: some View {
    NavigationStack {
      ZStack {
        VerimayaTheme.bg.ignoresSafeArea()

        Form {
          if !siblings.isEmpty {
            Section {
              Label(
                "Bu mesajla aynı tutarı taşıyan \(siblings.count) mesaj daha var. Hepsini onaylarsan aynı kayıt birden çok kez oluşur.",
                systemImage: "exclamationmark.triangle"
              )
              .font(.footnote)
              .foregroundStyle(VerimayaTheme.warning)
            } header: {
              Text("Aynı olay olabilir")
            }
          }

          Section("Mesaj") {
            Text(message.body ?? "(boş mesaj)")
              .font(.footnote)
              .foregroundStyle(VerimayaTheme.textMuted)
          }

          ForEach($forms) { $form in
            Section(form.draft.title) {
              LabeledContent("Tür", value: form.draft.kind.label)
              LabeledContent(
                "Tutar",
                value: Money.format(minor: form.draft.amount, currency: form.draft.currency.rawValue)
              )
              LabeledContent("Tarih", value: DateFmt.day(form.draft.occurredOn))

              Picker("Ödeme durumu", selection: $form.status) {
                Text("Seçilmedi").tag(TransactionStatus?.none)
                ForEach(TransactionStatus.allCases) { status in
                  Text(status.label).tag(TransactionStatus?.some(status))
                }
              }

              if form.status == .partial {
                HStack {
                  Text("Ödenen")
                  Spacer()
                  TextField("0", text: $form.partialPaidText)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 140)
                }
              }

              if form.draft.currency != baseCurrency {
                HStack {
                  Text("Kur (1 \(form.draft.currency.rawValue) = ? \(baseCurrency.rawValue))")
                    .font(.footnote)
                  Spacer()
                  TextField("0,00", text: $form.fxRateText)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 100)
                }
              }

              TextField("Karşı taraf", text: $form.counterpartyLabel)

              if let problem = form.problem(baseCurrency: baseCurrency) {
                Text(problem)
                  .font(.caption)
                  .foregroundStyle(VerimayaTheme.danger)
              }
            }
          }
        }
        .scrollContentBackground(.hidden)
      }
      .navigationTitle("Onay")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Vazgeç") {
            vm.closeDrafts()
            dismiss()
          }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Onayla") { Task { await approve() } }
            .disabled(!canApprove || isApproving)
        }
      }
      .task {
        forms = drafts.map(DraftForm.init)
        if let tenant = try? await APIClient.shared.currentTenant() {
          baseCurrency = tenant.baseCurrency
        }
        // Taban para birimi öğrenildikten sonra aynı para birimli taslakların
        // kuru 1'e sabitlenir; farklı olanı kullanıcı girer.
        for index in forms.indices where forms[index].draft.currency == baseCurrency {
          forms[index].fxRateText = "1"
        }
      }
    }
  }

  private var canApprove: Bool {
    !forms.isEmpty && forms.allSatisfy { $0.problem(baseCurrency: baseCurrency) == nil }
  }

  private func approve() async {
    isApproving = true
    defer { isApproving = false }
    let items = forms.compactMap { $0.toApproveItem(baseCurrency: baseCurrency) }
    guard items.count == forms.count else { return }
    if await vm.approve(items) { dismiss() }
  }
}

/// Tek taslağın düzenlenebilir hâli. Doğrulama sunucudaki zod kurallarını
/// birebir yansıtır — istek gitmeden önce burada tutulur.
struct DraftForm: Identifiable {
  let id = UUID()
  let draft: TransactionDraft
  var status: TransactionStatus?
  var partialPaidText: String = ""
  var fxRateText: String = ""
  var counterpartyLabel: String

  init(draft: TransactionDraft) {
    self.draft = draft
    self.counterpartyLabel = draft.contactDisplayName ?? draft.contactLabel ?? ""
  }

  var fxRate: Double? {
    Double(fxRateText.replacingOccurrences(of: ",", with: "."))
  }

  /// Kısmi ödemede kullanıcı majör birim (TL) yazar; sunucu minör bekler.
  var partialPaidMinor: Int? {
    let normalized = partialPaidText.replacingOccurrences(of: ",", with: ".")
    guard let major = Double(normalized) else { return nil }
    return Int((major * 100).rounded())
  }

  func paidAmount() -> Int? {
    switch status {
    case .paid: draft.amount
    case .unpaid: 0
    case .partial: partialPaidMinor
    case nil: nil
    }
  }

  /// Onaya engel olan ilk sorun; hepsi geçerse nil.
  func problem(baseCurrency: SupportedCurrency) -> String? {
    guard let status else { return "Ödeme durumu seçilmedi." }
    guard let paid = paidAmount() else { return "Ödenen tutar okunamadı." }
    if status == .partial && (paid <= 0 || paid >= draft.amount) {
      return "Kısmi ödemede ödenen tutar 0 ile toplam arasında olmalı."
    }
    if draft.contactId == nil && counterpartyLabel.trimmingCharacters(in: .whitespaces).isEmpty {
      return "Karşı taraf boş olamaz."
    }
    if draft.currency != baseCurrency {
      guard let rate = fxRate, rate > 0 else { return "Kur girilmedi." }
    }
    return nil
  }

  func toApproveItem(baseCurrency: SupportedCurrency) -> ApproveDraftItem? {
    guard problem(baseCurrency: baseCurrency) == nil,
          let status,
          let paid = paidAmount()
    else { return nil }

    let rate = draft.currency == baseCurrency ? 1 : (fxRate ?? 1)
    let label = counterpartyLabel.trimmingCharacters(in: .whitespaces)

    return ApproveDraftItem(
      kind: draft.kind,
      amount: draft.amount,
      currency: draft.currency,
      title: draft.title,
      category: draft.category,
      subcategory: draft.subcategory,
      contactId: draft.contactId,
      contactDisplayName: draft.contactDisplayName,
      contactLabel: label.isEmpty ? nil : label,
      occurredOn: draft.occurredOn,
      paymentMethod: draft.paymentMethod,
      description: draft.description,
      status: status,
      paidAmount: paid,
      fxRate: rate,
      amountBase: Int((Double(draft.amount) * rate).rounded())
    )
  }
}
