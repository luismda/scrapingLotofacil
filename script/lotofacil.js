import puppeteer from 'puppeteer'
import xl from 'excel4node'

const acessarNavegador = async () => {
    console.clear()
    console.log('--> Acessando página da Lotofácil')

    const browser = await puppeteer.launch()
    const page = await browser.newPage()
    await page.setViewport({ width: 1366, height: 768 })
    await page.goto('https://loterias.caixa.gov.br/Paginas/Lotofacil.aspx', { waitUntil: ['networkidle2', 'domcontentloaded'] })

    return { browser, page }
}

const pegarConcursos = async page => {
    console.clear()
    console.log('--> Pegando os concursos \n')

    let concursos = []
    let concursosJaPegou = []

    let dataParada

    while(true){
        const numeroConcurso = await page.$eval('#resultados h2 .ng-binding', concurso => 
            parseInt(concurso.textContent.split(' ')[1]))
        
        const dataConcurso = await page.$eval('#resultados h2 .ng-binding', dataConcurso => 
            dataConcurso.textContent.split(' ')[2].replace(/\(|\)/g, '').split('/').reverse().join('-'))

        if (!concursos.length) {
            const dataSeparada = dataConcurso.split('-')
            const dataUltimoConcurso = new Date(parseInt(dataSeparada[0]), parseInt(dataSeparada[1])-1, parseInt(dataSeparada[2]))
            
            dataUltimoConcurso.setDate(dataUltimoConcurso.getDate() - 365)
            dataParada = dataUltimoConcurso.toLocaleDateString().split('/').reverse().join('-')
        }

        if (dataConcurso >= dataParada) {
            if (!concursosJaPegou.includes(numeroConcurso)) {
                concursosJaPegou.push(numeroConcurso)
                
                console.log(`--> Concurso ${numeroConcurso} (${dataConcurso.split('-').reverse().join('/')}) \n`)

                const apostasGanhadoras = await page.$eval('[ng-repeat="premio in resultado.listaRateioPremio"] span', ganhadores => {
                    const numeroGanhadores = parseInt(ganhadores.textContent.split(' ')[0])
                    return numeroGanhadores ? numeroGanhadores : 0
                })

                const premiacao = await page.$eval('[ng-repeat="premio in resultado.listaRateioPremio"] span', premiacao => {
                    const premiacaoGanhadores = premiacao.textContent.split(' ')
                    const valorPremiacao = parseFloat(premiacaoGanhadores[premiacaoGanhadores.length-1].replace(/\./g, '').replace(',', '.'))
                    return valorPremiacao ? valorPremiacao : 0.00
                })

                const premiacaoTotal = apostasGanhadoras ? apostasGanhadoras * premiacao : 0.00

                const estimativa = await page.$eval('.resultado-loteria .next-prize [ng-hide="resultado.rateioProcessamento"]', estimativa =>
                    parseFloat(estimativa.textContent.trim().split(' ')[1].replace(/\./g, '').replace(',', '.'))) 

                const dataProximoConcurso = await page.$eval('.resultado-loteria .next-prize p', dataProximoConcurso =>
                    dataProximoConcurso.textContent.trim().match(/\d{2}\/\d{2}\/\d{4}/g)[0].split('/').reverse().join('-'))

                concursos.push({
                    numeroConcurso,
                    dataConcurso,
                    apostasGanhadoras: apostasGanhadoras ? apostasGanhadoras.toString() : 'Não houve acertador',
                    premiacao,
                    premiacaoTotal,
                    dataProximoConcurso,
                    estimativa
                })

                await page.click('[ng-click="carregarConcursoAnterior()"]', { delay: 60 })
                await new Promise(r => setTimeout(r, 800))   
            }
        } else {
            break
        }
    }

    return concursos
}

const gerarPlanilha = concursos => {
    const wb = new xl.Workbook()
    const ws = wb.addWorksheet('Planilha de concursos Lotofácil')

    const colunas = [
        'Concurso', 
        'Data do concurso', 
        'Apostas ganhadoras', 
        'Premiação', 
        'Premiação total', 
        'Data do próximo concurso', 
        'Estimativa do próximo concurso'
    ]

    colunas.forEach((coluna, index) => {
        ws.cell(1, index+1).string(coluna).style({ font: { bold: true } })
    })

    const formatarMoeda = { numberFormat: 'R$ #,##0.00; (R$ #,##0.00)' }

    let linha = 2
    concursos.forEach(concurso => {
        ws.cell(linha, 1).number(concurso.numeroConcurso)
        ws.cell(linha, 2).date(concurso.dataConcurso).style({ numberFormat: 'dd/mm/yyyy' })
        ws.cell(linha, 3).string(concurso.apostasGanhadoras)
        ws.cell(linha, 4).number(concurso.premiacao).style(formatarMoeda)
        ws.cell(linha, 5).number(concurso.premiacaoTotal).style(formatarMoeda)
        ws.cell(linha, 6).date(concurso.dataProximoConcurso).style({ numberFormat: 'dd/mm/yyyy' })
        ws.cell(linha, 7).number(concurso.estimativa).style(formatarMoeda)

        linha++
    })

    wb.write('concursos-lotofacil.xlsx')

    console.clear()
    console.log('--> Planilha de concursos gerada com êxito')
}

(async function main() {
    const { browser, page } = await acessarNavegador()

    const concursos = await pegarConcursos(page)
    
    await browser.close()

    gerarPlanilha(concursos)
})().catch(error => {
    console.log(`Ocorreu um erro: ${error} \n ${error.stack}`)
    process.exit()
})
