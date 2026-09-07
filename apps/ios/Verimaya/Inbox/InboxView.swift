import SwiftUI

/// AI ile İşlem — web panelindeki `/finance/ai-transaction` mobil görünümü.
///
/// Düzen: başlık + açıklama · "Mesajı yapıştır" kartı (metin alanı + Analiz Et) ·
/// "Bekleyenler (N)" kartı ("Yeni mesajları işle" düğmesi + mesaj satırları).
struct InboxView: View {
  @StateObject private var vm = InboxViewModel()
  @State private var pasted = ""

  private static let placeholder = """
    Örnek:
    Sandra 2900 GBP 2. vizit ödemesi + 450 GBP t-base ücretleri alındı.
    Toplamda 3.350 GBP kart ile ödeme alındı.
    """

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        if let message = vm.statusMessage {
          Text(message)
            .font(.footnote)
            .foregroundStyle(VerimayaTheme.info)
        }

        VStack(alignment: .leading, spacing: 4) {
          Text("AI ile İşlem")
            .font(.title2.weight(.semibold))
            .foregroundStyle(VerimayaTheme.text)
          Text(
            "WhatsApp grup mesajını yapıştır veya kuyruktan seç — AI işlemleri "
              + "ayrıştırır, onayladıktan sonra kayıt açılır."
          )
          .font(.subheadline)
          .foregroundStyle(VerimayaTheme.textMuted)
          .fixedSize(horizontal: false, vertical: true)
        }

        pasteCard
        pendingCard
      }
      .padding(VerimayaUI.pagePadding)
      .padding(.bottom, 72)
    }
    .background(VerimayaTheme.bg)
    .refreshable { await vm.refresh() }
    .sheet(item: $vm.activeMessage) { message in
      DraftApprovalView(
        message: message,
        drafts: vm.drafts,
        siblings: vm.groupSiblings(of: message),
        vm: vm
      )
    }
    .task { await vm.load(reset: true) }
  }

  private var pasteCard: some View {
    PanelCard {
      VStack(alignment: .leading, spacing: 12) {
        Text("Mesajı yapıştır")
          .font(.body.weight(.semibold))
          .foregroundStyle(VerimayaTheme.text)

        ZStack(alignment: .topLeading) {
          if pasted.isEmpty {
            Text(Self.placeholder)
              .font(.system(.subheadline, design: .monospaced))
              .foregroundStyle(VerimayaTheme.textFaint)
              .padding(.horizontal, 12)
              .padding(.vertical, 10)
              .allowsHitTesting(false)
          }
          TextEditor(text: $pasted)
            .font(.system(.subheadline, design: .monospaced))
            .scrollContentBackground(.hidden)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .frame(minHeight: 140)
        }
        .background(VerimayaTheme.surface2)
        .clipShape(RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl))
        .overlay(
          RoundedRectangle(cornerRadius: VerimayaTheme.radiusControl)
            .stroke(VerimayaTheme.border, lineWidth: 1)
        )

        BrandButton(title: "Analiz Et", systemImage: "sparkles") {
          Task { await vm.analyzePasted(pasted) }
        }
        .opacity(pasted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.5 : 1)
        .disabled(pasted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || vm.isParsing)
      }
    }
  }

  private var pendingCard: some View {
    PanelCard {
      VStack(alignment: .leading, spacing: 14) {
        HStack(alignment: .center) {
          HStack(spacing: 4) {
            Text("Bekleyenler")
              .font(.body.weight(.semibold))
              .foregroundStyle(VerimayaTheme.text)
            Text("(\(vm.pendingCount))")
              .font(.body)
              .foregroundStyle(VerimayaTheme.textMuted)
          }
          Spacer(minLength: 8)
          OutlineButton(title: vm.isProcessing ? "İşleniyor…" : "Yeni mesajları işle") {
            Task { await vm.processNew() }
          }
          .disabled(vm.isProcessing)
        }

        if vm.pending.isEmpty {
          Text("Bekleyen mesaj yok.")
            .font(.subheadline)
            .foregroundStyle(VerimayaTheme.textMuted)
            .padding(.vertical, 8)
        } else {
          ForEach(Array(vm.pending.enumerated()), id: \.element.id) { index, item in
            if index > 0 {
              Divider().overlay(VerimayaTheme.border)
            }
            InboxMessageRow(
              message: item,
              siblingCount: vm.groupSiblings(of: item).count,
              isParsing: vm.isParsing,
              onAnalyze: { Task { await vm.analyze(item) } },
              onIgnore: { Task { await vm.ignore(item.id) } }
            )
          }
        }
      }
    }
  }
}

/// Tek mesaj satırı: gönderen · durum rozeti · saat · gövde · iki düğme.
/// AI-13 "aynı olay" uyarısı gövdenin altında.
private struct InboxMessageRow: View {
  let message: InboundMessage
  let siblingCount: Int
  let isParsing: Bool
  let onAnalyze: () -> Void
  let onIgnore: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 8) {
        Text(message.sender ?? message.chatName ?? emptyDash)
          .font(.system(.caption, design: .monospaced))
          .foregroundStyle(VerimayaTheme.textMuted)
          .lineLimit(1)

        Chip(text: message.status.label, tone: message.status == .new ? .warning : .info)

        Spacer(minLength: 4)

        Text(DateFmt.dateTime(message.createdAt))
          .font(.caption)
          .foregroundStyle(VerimayaTheme.textMuted)
          .lineLimit(1)
      }

      Text(message.body?.isEmpty == false ? message.body! : "(boş mesaj)")
        .font(.subheadline)
        .foregroundStyle(VerimayaTheme.text)
        .fixedSize(horizontal: false, vertical: true)

      if siblingCount > 0 {
        Label(
          "Aynı olay olabilir — bu tutar aynı sohbetteki \(siblingCount) mesajda daha geçiyor. "
            + "İkisini de onaylarsan aynı kayıt iki kez oluşur.",
          systemImage: "exclamationmark.triangle"
        )
        .font(.caption)
        .foregroundStyle(VerimayaTheme.warning)
        .fixedSize(horizontal: false, vertical: true)
      }

      if let parseError = message.parseError {
        Text(parseError)
          .font(.caption)
          .foregroundStyle(VerimayaTheme.danger)
      }

      HStack(spacing: 8) {
        BrandButton(title: "Analiz Et", action: onAnalyze)
          .disabled(isParsing)
        OutlineButton(title: "Yoksay", action: onIgnore)
      }
    }
    .padding(.vertical, 2)
  }
}
